// Referral repository: every SQL query the app runs lives here (or in another
// file under src/server/). Route handlers call these functions; the browser
// reaches them only through /api/* via src/lib/data.ts.
//
// Every mutation takes the acting user and writes an audit_log row.

import 'server-only';
import { getDb, type Queryable } from './db';
import { normCalDay, outcomeLabel } from '@/lib/format';
import type { SessionUser } from '@/lib/auth-types';
import type {
  Referral, ReferralState, Attempt, ConfirmQueueItem, EscalationItem, OutreachLogEntry,
  CalendarEvent, PipelineCount, ReferralLogEntry, OutreachOutcome, Priority, TranscriptTurn,
} from '@/lib/types';

export type Actor = SessionUser;

export const REFERRAL_STATES: ReferralState[] = [
  'Queued', 'In Progress', 'Attempted', 'Pending Confirmation', 'Booked', 'Escalated',
];

// ── Formatting (always in the clinic's time zone, not the server's) ──────────

const TZ = process.env.CLINIC_TIMEZONE || 'America/Los_Angeles';

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return '';
  return new Date(v).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

export function fmtToday(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
}

function calcAge(isoDob: string | null): number {
  if (!isoDob) return 0;
  const [y, m, d] = isoDob.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

function isoToMdy(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** "MM/DD/YYYY" → "YYYY-MM-DD" (null if not parseable). */
function mdyToIso(mdy: string | undefined): string | null {
  const m = mdy?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

/** Referrals in 'In Progress' with at least one attempt display as 'Attempted' (REFERRAL_STATUSES.md). */
function deriveState(raw: string, attemptCount: number): ReferralState {
  return (raw === 'In Progress' && attemptCount > 0 ? 'Attempted' : raw) as ReferralState;
}

// ── Audit ────────────────────────────────────────────────────────────────────

const VIEW_ACTION = 'referral.view';

async function audit(
  q: Queryable, actor: Actor | null, referralId: string | null, action: string, what: string,
): Promise<void> {
  await q.query(
    `insert into audit_log (referral_id, actor_id, actor_name, actor_role, action, what)
     values ($1, $2, $3, $4, $5, $6)`,
    [referralId, actor?.id ?? null, actor?.name ?? null, actor?.role ?? 'system', action, what],
  );
}

// ── Row types ────────────────────────────────────────────────────────────────

interface ReferralRow {
  id: string; reason: string | null; referring_provider: string | null; referral_source: string | null;
  referral_time: Date; location: string; priority: string; state: string;
  escalation_reason: string | null; escalation_severity: string | null;
  escalation_raised_at: Date | null; escalation_owner: string | null;
  p_name: string; p_dob: string | null; p_sex: string | null; p_phone: string | null;
  p_language: string; p_insurance: string | null; p_mrn: string | null;
}
interface AttemptRow {
  id: string; referral_id: string; attempted_at: Date; channel: string; outcome: string | null;
  summary: string | null; transcript: unknown; slot_day: string | null;
}

/**
 * Relay is SMS-only. Older databases may still hold voice rows in call_attempts
 * (the table keeps its historical name); they are never shown or counted.
 */
const SMS_ONLY = `channel = 'sms'`;
interface ApptRow {
  referral_id: string; status: string; day: string; time: string; provider: string;
  captured_at: Date; confirmed_at: Date | null; confirmed_by: string | null; mirror_status: string;
}
interface AuditRow {
  referral_id: string; created_at: Date; actor_name: string | null; actor_role: string | null; what: string;
}

const REFERRAL_COLUMNS = `
  r.id, r.reason, r.referring_provider, r.referral_source, r.referral_time, r.location,
  r.priority, r.state, r.escalation_reason, r.escalation_severity, r.escalation_raised_at,
  r.escalation_owner,
  p.name as p_name, to_char(p.date_of_birth, 'YYYY-MM-DD') as p_dob, p.sex as p_sex,
  p.phone as p_phone, p.language as p_language, p.insurance as p_insurance, p.mrn as p_mrn`;

function asTranscript(v: unknown): TranscriptTurn[] {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  return Array.isArray(v) ? (v as TranscriptTurn[]) : [];
}

/** Loads full Referral objects (patient, attempts, appointments, audit) in 5 queries. */
async function loadReferrals(
  q: Queryable, filter: { ids?: string[]; states?: string[] } = {},
): Promise<Referral[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.ids) { params.push(filter.ids); where.push(`r.id = any($${params.length}::text[])`); }
  if (filter.states) { params.push(filter.states); where.push(`r.state = any($${params.length}::text[])`); }

  const { rows } = await q.query<ReferralRow>(
    `select ${REFERRAL_COLUMNS}
       from referrals r join patients p on p.id = r.patient_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by r.referral_time desc`,
    params,
  );
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);

  const [attempts, appts, audits] = await Promise.all([
    q.query<AttemptRow>(
      `select * from call_attempts where referral_id = any($1::text[]) and ${SMS_ONLY} order by attempted_at asc, id asc`, [ids]),
    q.query<ApptRow>(
      `select * from appointments where referral_id = any($1::text[]) and status in ('captured','confirmed')
        order by captured_at desc`, [ids]),
    q.query<AuditRow>(
      `select referral_id, created_at, actor_name, actor_role, what from audit_log
        where referral_id = any($1::text[]) and action <> $2 order by created_at asc`, [ids, VIEW_ACTION]),
  ]);

  const group = <T extends { referral_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) (m.get(x.referral_id) ?? m.set(x.referral_id, []).get(x.referral_id)!).push(x);
    return m;
  };
  const attemptsBy = group(attempts.rows);
  const apptsBy = group(appts.rows);
  const auditBy = group(audits.rows);

  return rows.map(row => {
    const atts: Attempt[] = (attemptsBy.get(row.id) ?? []).map((a, idx) => ({
      n: idx + 1,
      timestamp: fmtDate(a.attempted_at),
      outcome: a.outcome as OutreachOutcome,
      summary: a.summary ?? '',
      transcript: asTranscript(a.transcript),
      ...(a.slot_day ? { slotDay: a.slot_day } : {}),
    }));
    const rowAppts = apptsBy.get(row.id) ?? [];
    const captured = rowAppts.find(a => a.status === 'captured');
    const confirmed = rowAppts.find(a => a.status === 'confirmed');

    return {
      id: row.id,
      patient: {
        name: row.p_name,
        age: calcAge(row.p_dob),
        sex: (row.p_sex === 'F' ? 'F' : 'M'),
        dateOfBirth: isoToMdy(row.p_dob),
        phone: row.p_phone ?? '',
        language: row.p_language,
        insurance: row.p_insurance ?? '',
        ...(row.p_mrn ? { mrn: row.p_mrn } : {}),
      },
      reason: row.reason ?? '',
      referringProvider: row.referring_provider ?? '',
      referralSource: row.referral_source ?? '',
      referralTime: fmtDate(row.referral_time),
      location: row.location ?? '',
      priority: row.priority as Priority,
      state: deriveState(row.state, atts.length),
      capturedSlot: captured ? {
        day: captured.day,
        time: captured.time,
        provider: captured.provider,
        capturedAgoMin: Math.floor((Date.now() - new Date(captured.captured_at).getTime()) / 60000),
      } : null,
      bookedAppointment: confirmed ? {
        day: confirmed.day,
        time: confirmed.time,
        provider: confirmed.provider,
        confirmedBy: confirmed.confirmed_by ?? 'Staff',
        confirmedAt: fmtDate(confirmed.confirmed_at),
        mirrorStatus: confirmed.mirror_status as 'mirrored' | 'pending' | 'failed',
      } : undefined,
      escalation: row.escalation_reason ? {
        reason: row.escalation_reason,
        severity: (row.escalation_severity ?? 'high') as 'high' | 'med' | 'low',
        raisedAt: fmtDate(row.escalation_raised_at),
        owner: row.escalation_owner,
      } : undefined,
      attempts: atts,
      audit: (auditBy.get(row.id) ?? []).map(e => ({
        at: fmtDate(e.created_at),
        who: e.actor_name ?? 'System',
        what: e.what,
      })),
    };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listReferrals(): Promise<Referral[]> {
  return loadReferrals(await getDb());
}

/** Loads one referral and records that `actor` opened it (access audit). */
export async function getReferralForView(id: string, actor: Actor): Promise<Referral | null> {
  const db = await getDb();
  const [ref] = await loadReferrals(db, { ids: [id] });
  if (!ref) return null;
  await audit(db, actor, id, VIEW_ACTION, 'Opened referral detail');
  return ref;
}

const PLACEHOLDER_SLOT = { day: 'To be confirmed', time: 'TBD', provider: 'TBD', capturedAgoMin: null };

export async function listConfirmQueue(): Promise<ConfirmQueueItem[]> {
  const refs = await loadReferrals(await getDb(), { states: ['Pending Confirmation'] });
  return refs.reverse().map(r => {   // oldest referral first
    const slot = r.capturedSlot ?? PLACEHOLDER_SLOT;
    const last = r.attempts[r.attempts.length - 1];
    return {
      referralId: r.id,
      patient: r.patient.name,
      age: r.patient.age,
      sex: r.patient.sex,
      reason: r.reason,
      referringProvider: r.referringProvider,
      language: r.patient.language,
      insurance: r.patient.insurance,
      slot,
      capturedAgoMin: slot.capturedAgoMin,
      priority: r.priority,
      summary: last?.summary ?? '',
    };
  });
}

/** Red Escalated referrals (safety), unclaimed first. Shown at the top of the confirm queue. */
export async function listEscalations(): Promise<EscalationItem[]> {
  const refs = await loadReferrals(await getDb(), { states: ['Escalated'] });
  return refs.filter(r => r.escalation).map(r => ({
    referralId: r.id,
    patient: r.patient.name,
    reason: r.escalation!.reason,
    severity: r.escalation!.severity,
    raisedAt: r.escalation!.raisedAt,
    owner: r.escalation!.owner,
    excerpt: r.attempts[r.attempts.length - 1]?.transcript?.slice(-2) ?? [],
  })).sort((x, y) => Number(!!x.owner) - Number(!!y.owner));
}

/** Every text outreach attempt, newest first (dashboard "Recent texting outreach"). */
export async function listOutreachLog(): Promise<OutreachLogEntry[]> {
  const refs = await listReferrals();
  const entries: (OutreachLogEntry & { sortKey: number })[] = [];
  const db = await getDb();
  const { rows } = await db.query<{ referral_id: string; attempted_at: Date }>(
    `select referral_id, attempted_at from call_attempts where ${SMS_ONLY} order by attempted_at asc, id asc`);
  const times = new Map<string, number[]>();
  for (const a of rows) (times.get(a.referral_id) ?? times.set(a.referral_id, []).get(a.referral_id)!).push(new Date(a.attempted_at).getTime());
  for (const r of refs) {
    r.attempts.forEach((a, i) => entries.push({
      referralId: r.id,
      patient: r.patient.name,
      language: r.patient.language,
      timestamp: a.timestamp,
      attempt: a.n,
      outcome: a.outcome,
      summary: a.summary,
      escalated: a.outcome === 'Escalated',
      referralState: r.state,
      sortKey: times.get(r.id)?.[i] ?? 0,
    }));
  }
  return entries.sort((a, b) => b.sortKey - a.sortKey).map(({ sortKey: _s, ...e }) => e);
}

export async function listReferralLog(): Promise<ReferralLogEntry[]> {
  const db = await getDb();
  const [attempts, audits] = await Promise.all([
    db.query<AttemptRow & { state: string; patient: string }>(
      `select a.*, r.state, p.name as patient
         from call_attempts a join referrals r on r.id = a.referral_id join patients p on p.id = r.patient_id
        where a.${SMS_ONLY}
        order by a.attempted_at asc, a.id asc`),
    db.query<AuditRow & { state: string | null; patient: string | null }>(
      `select l.referral_id, l.created_at, l.actor_name, l.actor_role, l.what, r.state, p.name as patient
         from audit_log l left join referrals r on r.id = l.referral_id left join patients p on p.id = r.patient_id
        where l.action <> $1 and l.referral_id is not null`, [VIEW_ACTION]),
  ]);

  const counter = new Map<string, number>();
  const entries: (ReferralLogEntry & { t: number })[] = [];
  for (const a of attempts.rows) {
    const n = (counter.get(a.referral_id) ?? 0) + 1;
    counter.set(a.referral_id, n);
    entries.push({
      t: new Date(a.attempted_at).getTime(),
      referralId: a.referral_id,
      patient: a.patient ?? '—',
      at: fmtDate(a.attempted_at),
      type: 'outreach',
      who: 'Texting assistant',
      what: `Text outreach · ${outcomeLabel(a.outcome)}`,
      referralState: a.state === 'In Progress' ? 'Attempted' : (a.state as ReferralState),
      detail: a.summary ?? undefined,
      outcome: a.outcome ?? undefined,
      escalated: a.outcome === 'Escalated',
      attempt: n,
    });
  }
  for (const e of audits.rows) {
    entries.push({
      t: new Date(e.created_at).getTime(),
      referralId: e.referral_id,
      patient: e.patient ?? '—',
      at: fmtDate(e.created_at),
      type: e.what.startsWith('State') ? 'system' : 'manual_update',
      who: e.actor_name ?? 'System',
      what: e.what,
      referralState: deriveState(e.state ?? 'Queued', counter.get(e.referral_id) ?? 0),
    });
  }
  return entries.sort((a, b) => b.t - a.t).map(({ t: _t, ...e }) => e);
}

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const refs = await listReferrals();
  const events: CalendarEvent[] = [];
  for (const r of refs) {
    const base = { referralId: r.id, patient: r.patient.name, location: r.location, reason: r.reason, state: r.state };
    if (r.bookedAppointment) {
      const day = normCalDay(r.bookedAppointment.day);
      if (day) events.push({ ...base, day, time: r.bookedAppointment.time, provider: r.bookedAppointment.provider,
        mirrorStatus: r.bookedAppointment.mirrorStatus, isShadow: false });
    }
    if (r.capturedSlot) {
      const day = normCalDay(r.capturedSlot.day);
      if (day) events.push({ ...base, day, time: r.capturedSlot.time, provider: r.capturedSlot.provider,
        mirrorStatus: 'pending', isShadow: true });
    }
  }
  return events;
}

async function derivedStateCounts(): Promise<Map<ReferralState, number>> {
  const db = await getDb();
  const { rows } = await db.query<{ state: string; attempted: boolean; n: number }>(
    `select r.state, exists(select 1 from call_attempts a where a.referral_id = r.id and a.${SMS_ONLY}) as attempted, count(*)::int as n
       from referrals r group by 1, 2`);
  const m = new Map<ReferralState, number>();
  for (const row of rows) {
    const s = deriveState(row.state, row.attempted ? 1 : 0);
    m.set(s, (m.get(s) ?? 0) + row.n);
  }
  return m;
}

export async function getPipeline(): Promise<PipelineCount[]> {
  const counts = await derivedStateCounts();
  return REFERRAL_STATES.map(s => ({ state: s, count: counts.get(s) ?? 0 }));
}

/** Confirm-queue badges: red escalations, amber needs-a-human items, slots to confirm; plus open referrals. */
export async function getSidebarCounts() {
  const db = await getDb();
  const [counts, needsHuman] = await Promise.all([
    derivedStateCounts(),
    db.query<{ n: number }>(`select count(*)::int as n from needs_human_items where resolved_at is null`),
  ]);
  let total = 0;
  for (const n of counts.values()) total += n;
  return {
    escalations: counts.get('Escalated') ?? 0,
    needsHuman: needsHuman.rows[0]?.n ?? 0,
    confirmQueue: counts.get('Pending Confirmation') ?? 0,
    referrals: total - (counts.get('Booked') ?? 0),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

type Result = { success: boolean };

async function referralExists(q: Queryable, id: string): Promise<boolean> {
  const { rows } = await q.query('select 1 from referrals where id = $1', [id]);
  return rows.length > 0;
}

export async function confirmSlot(referralId: string, actor: Actor): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query<{ day: string; time: string }>(
      `update appointments set status = 'confirmed', confirmed_at = now(), confirmed_by = $2, mirror_status = 'mirrored'
        where referral_id = $1 and status = 'captured' returning day, time`, [referralId, actor.name]);
    if (rows.length === 0) return { success: false };
    await tx.query(`update referrals set state = 'Booked', updated_at = now() where id = $1`, [referralId]);
    await audit(tx, actor, referralId, 'slot.confirm', 'Slot confirmed in practice system');
    return { success: true };
  });
}

export async function rejectSlot(referralId: string, actor: Actor): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    if (!(await referralExists(tx, referralId))) return { success: false };
    await tx.query(`update appointments set status = 'expired' where referral_id = $1 and status = 'captured'`, [referralId]);
    await tx.query(`update referrals set state = 'In Progress', updated_at = now() where id = $1`, [referralId]);
    await audit(tx, actor, referralId, 'slot.reject', 'Slot rejected — re-entering outreach');
    return { success: true };
  });
}

export async function claimAlert(referralId: string, actor: Actor): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query(
      `update referrals set escalation_owner = $2, updated_at = now() where id = $1 returning id`, [referralId, actor.name]);
    if (rows.length === 0) return { success: false };
    await audit(tx, actor, referralId, 'alert.claim', `Alert claimed by ${actor.name}`);
    return { success: true };
  });
}

export async function updateAppointment(
  referralId: string,
  updates: { day?: string; time?: string; provider?: string; location?: string },
  actor: Actor,
): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    if (!(await referralExists(tx, referralId))) return { success: false };
    const day = updates.day ? (normCalDay(updates.day) ?? updates.day) : null;
    await tx.query(
      `update appointments set day = coalesce($2, day), time = coalesce($3, time), provider = coalesce($4, provider)
        where referral_id = $1 and status = 'confirmed'`,
      [referralId, day, updates.time || null, updates.provider || null]);
    if (updates.location) {
      await tx.query('update referrals set location = $2, updated_at = now() where id = $1', [referralId, updates.location]);
    }
    await audit(tx, actor, referralId, 'appointment.edit', 'Appointment details edited');
    return { success: true };
  });
}

export async function cancelAppointment(referralId: string, actor: Actor): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    if (!(await referralExists(tx, referralId))) return { success: false };
    await tx.query(`update appointments set status = 'cancelled' where referral_id = $1 and status = 'confirmed'`, [referralId]);
    await tx.query(`update referrals set state = 'Pending Confirmation', updated_at = now() where id = $1`, [referralId]);
    await audit(tx, actor, referralId, 'appointment.cancel', 'Appointment cancelled — returned to Pending Confirmation');
    return { success: true };
  });
}

export async function updateReferralState(referralId: string, state: ReferralState, actor: Actor): Promise<Result> {
  // 'Attempted' is a derived display state; store it as 'In Progress'.
  const stored = state === 'Attempted' ? 'In Progress' : state;
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query(
      `update referrals set state = $2, updated_at = now() where id = $1 returning id`, [referralId, stored]);
    if (rows.length === 0) return { success: false };
    await audit(tx, actor, referralId, 'referral.state', `State updated to ${state}`);
    return { success: true };
  });
}

export interface ReferralDraft {
  patientName?: string; dateOfBirth?: string; phone?: string; language?: string;
  insurance?: string; reason?: string; referringProvider?: string; priority?: string;
}

const DRAFT_KEYS = ['patientName', 'dateOfBirth', 'phone', 'language', 'insurance', 'reason', 'referringProvider', 'priority'] as const;

/** Keeps only known draft fields that are strings, trimmed and length-capped (input from the browser). */
export function sanitizeDraft(raw: unknown): ReferralDraft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: ReferralDraft = {};
  for (const k of DRAFT_KEYS) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, k === 'reason' ? 1000 : 200);
  }
  return out;
}

const phoneDigits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

export async function updateReferral(
  referralId: string, rawDraft: ReferralDraft, rawComment: string | undefined, actor: Actor,
): Promise<Result> {
  const draft = sanitizeDraft(rawDraft);
  const comment = typeof rawComment === 'string' ? rawComment.slice(0, 1000) : undefined;
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query<{ patient_id: string; phone: string | null; dob: string | null }>(
      `select r.patient_id, p.phone, to_char(p.date_of_birth, 'YYYY-MM-DD') as dob
         from referrals r join patients p on p.id = r.patient_id where r.id = $1`, [referralId]);
    if (rows.length === 0) return { success: false };
    const before = rows[0];
    const priority = draft.priority === 'urgent' || draft.priority === 'normal' ? draft.priority : null;

    await tx.query(
      `update patients set name = coalesce($2, name), phone = coalesce($3, phone), language = coalesce($4, language),
              insurance = coalesce($5, insurance), date_of_birth = coalesce($6::date, date_of_birth)
        where id = $1`,
      [rows[0].patient_id, draft.patientName || null, draft.phone || null, draft.language || null,
        draft.insurance || null, mdyToIso(draft.dateOfBirth)]);
    await tx.query(
      `update referrals set reason = coalesce($2, reason), referring_provider = coalesce($3, referring_provider),
              priority = coalesce($4, priority), updated_at = now()
        where id = $1`,
      [referralId, draft.reason || null, draft.referringProvider || null, priority]);

    const lines: string[] = [];
    if (draft.patientName)       lines.push(`Name → ${draft.patientName}`);
    if (draft.phone)             lines.push(`Phone → ${draft.phone}`);
    if (draft.language)          lines.push(`Language → ${draft.language}`);
    if (draft.insurance)         lines.push(`Insurance → ${draft.insurance}`);
    if (draft.dateOfBirth)       lines.push(`DOB → ${draft.dateOfBirth}`);
    if (draft.reason)            lines.push(`Reason → ${draft.reason}`);
    if (draft.referringProvider) lines.push(`Provider → ${draft.referringProvider}`);
    if (priority)                lines.push(`Priority → ${priority}`);
    if (comment?.trim())         lines.push(`Comment: ${comment.trim()}`);
    if (lines.length) await audit(tx, actor, referralId, 'referral.edit', `Manual edit — ${lines.join(' · ')}`);

    // A new phone number (or corrected DOB) means whoever answers next has NOT proven who they
    // are: a text identity check done by the old number's holder must not carry over (R4.2/R4.4).
    const newDob = mdyToIso(draft.dateOfBirth);
    const phoneChanged = !!draft.phone && phoneDigits(draft.phone) !== phoneDigits(before.phone);
    const dobChanged = !!newDob && newDob !== before.dob;
    if (phoneChanged || dobChanged) {
      const { rows: reset } = await tx.query<{ referral_id: string }>(
        `update sms_conversations set identity_verified = false, identity_verified_at = null, identity_attempts = 0,
                updated_at = now()
          where referral_id in (select id from referrals where patient_id = $1) and identity_verified
          returning referral_id`, [before.patient_id]);
      for (const r of reset) {
        await audit(tx, actor, r.referral_id, 'sms.identity_reset',
          `${phoneChanged ? 'Phone number' : 'Date of birth'} changed — patient must confirm date of birth again by text`);
      }
    }
    return { success: true };
  });
}

export interface IngestRow {
  patientName: string; dateOfBirth?: string; phone: string; sex?: 'M' | 'F' | '';
  language?: string; insurance?: string; reason?: string; referringProvider?: string;
  priority?: Priority; location?: string;
  /**
   * SMS consent is never assumed: only an explicit `true` records consent (with
   * who recorded it and where it came from). Anything else leaves consent off,
   * so the texting assistant will not contact the patient until staff record it.
   */
  smsConsent?: boolean;
  /** Where consent was obtained, e.g. "intake form", "verbal at front desk". */
  smsConsentSource?: string;
}

/** Coerces one ingest row from the browser: strings only, trimmed and length-capped; consent only if exactly true. */
export function sanitizeIngestRow(raw: unknown): IngestRow {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (k: string, max = 200) => (typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, max) : '');
  const opt = (k: string, max = 200) => s(k, max) || undefined;
  return {
    patientName: s('patientName'), phone: s('phone', 40), dateOfBirth: opt('dateOfBirth', 20),
    sex: r.sex === 'F' ? 'F' : r.sex === 'M' ? 'M' : '', language: opt('language', 40), insurance: opt('insurance'),
    reason: opt('reason', 1000), referringProvider: opt('referringProvider'),
    priority: r.priority === 'urgent' ? 'urgent' : 'normal', location: opt('location'),
    smsConsent: r.smsConsent === true, smsConsentSource: opt('smsConsentSource', 120),
  };
}

export async function ingestReferrals(
  rows: IngestRow[], actor: Actor, via: 'upload' | 'manual' = 'upload',
): Promise<{ success: boolean; importedCount: number; consentedCount: number }> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows: maxRows } = await tx.query<{ max: number | null }>(
      `select max(substring(id from 5)::int) as max from referrals where id ~ '^REF-[0-9]+$'`);
    let next = Math.max(maxRows[0]?.max ?? 0, 1042) + 1;
    let importedCount = 0;
    let consentedCount = 0;
    for (const raw of rows) {
      const row = sanitizeIngestRow(raw);
      if (!row.patientName || !row.phone) continue;
      const consent = row.smsConsent === true;
      const consentSource = consent
        ? `${(row.smsConsentSource?.trim() || 'referral intake').slice(0, 80)} (recorded by ${actor.name})`
        : null;
      const { rows: pt } = await tx.query<{ id: string }>(
        `insert into patients (name, phone, language, insurance, sex, date_of_birth,
           sms_consent, sms_consent_at, sms_consent_source)
         values ($1, $2, $3, $4, $5, $6::date, $7::boolean, case when $7::boolean then now() end, $8) returning id`,
        [row.patientName.trim(), row.phone.trim(), row.language || 'English', row.insurance ?? '',
          row.sex === 'F' ? 'F' : 'M', mdyToIso(row.dateOfBirth), consent, consentSource]);
      const referralId = `REF-${next++}`;
      await tx.query(
        `insert into referrals (id, patient_id, reason, referring_provider, referral_source, location, priority, state)
         values ($1, $2, $3, $4, $5, $6, $7, 'Queued')`,
        [referralId, pt[0].id, row.reason ?? '', row.referringProvider ?? '',
          via === 'manual' ? 'Manual entry' : 'Uploaded batch', row.location || 'Providence',
          row.priority === 'urgent' ? 'urgent' : 'normal']);
      await audit(tx, actor, referralId, 'referral.ingest',
        `${via === 'manual' ? 'Entered manually' : 'Ingested via spreadsheet upload'} · ` +
        (consent ? `SMS consent recorded (${consentSource})` : 'SMS consent not recorded — no texts until staff record it'));
      importedCount++;
      if (consent) consentedCount++;
    }
    return { success: true, importedCount, consentedCount };
  });
}
