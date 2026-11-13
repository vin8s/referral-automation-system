// Referral repository: every SQL query the app runs lives here (or in another
// file under src/server/). Route handlers call these functions; the browser
// reaches them only through /api/* via src/lib/data.ts.
//
// Every mutation takes the acting user and writes an audit_log row.

import 'server-only';
import { getDb, type Queryable } from './db';
import { normCalDay } from '@/lib/format';
import { DEFAULT_SETTINGS, VALID_CALL_ORDERS } from '@/lib/settingsDefaults';
import type { SessionUser } from '@/lib/auth-types';
import type {
  Referral, ReferralState, Attempt, ConfirmQueueItem, UrgentAlert, CallLogEntry,
  CalendarEvent, PipelineCount, ReferralLogEntry, Channel, CallOutcome, Priority,
  PracticeSettings, TranscriptTurn,
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

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Accepts "3m 24s", "24s" or "3:24". */
function parseDurationToSecs(duration: string): number {
  if (!duration || duration === '—') return 0;
  const colon = duration.match(/^(\d+):(\d{2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const mMatch = duration.match(/(\d+)m/);
  const sMatch = duration.match(/(\d+)s/);
  return (mMatch ? parseInt(mMatch[1], 10) * 60 : 0) + (sMatch ? parseInt(sMatch[1], 10) : 0);
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
  p_language: string; p_insurance: string | null;
}
interface AttemptRow {
  id: string; referral_id: string; attempted_at: Date; channel: string; outcome: string | null;
  duration_secs: number | null; disclosure_played: boolean; summary: string | null;
  transcript: unknown; slot_day: string | null;
}
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
  p.phone as p_phone, p.language as p_language, p.insurance as p_insurance`;

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
      `select * from call_attempts where referral_id = any($1::text[]) order by attempted_at asc, id asc`, [ids]),
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
      channel: a.channel as Channel,
      outcome: a.outcome as CallOutcome,
      duration: fmtDuration(a.duration_secs),
      disclosurePlayed: a.disclosure_played,
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

/** Phone number for an outbound call, looked up server-side (never trust the browser's number). */
export async function getPatientPhone(referralId: string): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ phone: string | null }>(
    `select p.phone from referrals r join patients p on p.id = r.patient_id where r.id = $1`, [referralId]);
  return rows[0]?.phone ?? null;
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
      transcript: last?.transcript ?? [],
    };
  });
}

export async function listUrgentAlerts(): Promise<UrgentAlert[]> {
  const refs = await loadReferrals(await getDb(), { states: ['Escalated'] });
  return refs.filter(r => r.escalation).map(r => ({
    referralId: r.id,
    patient: r.patient.name,
    reason: r.escalation!.reason,
    severity: r.escalation!.severity,
    raisedAt: r.escalation!.raisedAt,
    owner: r.escalation!.owner,
    transcriptExcerpt: r.attempts[r.attempts.length - 1]?.transcript?.slice(-2) ?? [],
  }));
}

export async function listCallLog(): Promise<CallLogEntry[]> {
  const refs = await listReferrals();
  const entries: (CallLogEntry & { sortKey: number })[] = [];
  const db = await getDb();
  const { rows } = await db.query<{ referral_id: string; attempted_at: Date }>(
    'select referral_id, attempted_at from call_attempts order by attempted_at asc, id asc');
  const times = new Map<string, number[]>();
  for (const a of rows) (times.get(a.referral_id) ?? times.set(a.referral_id, []).get(a.referral_id)!).push(new Date(a.attempted_at).getTime());
  for (const r of refs) {
    r.attempts.forEach((a, i) => entries.push({
      referralId: r.id,
      patient: r.patient.name,
      language: r.patient.language,
      timestamp: a.timestamp,
      attempt: a.n,
      channel: a.channel,
      outcome: a.outcome,
      duration: a.duration,
      summary: a.summary,
      hasTranscript: a.transcript.length > 0,
      escalated: a.outcome === 'Escalated',
      disclosurePlayed: a.disclosurePlayed,
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
      type: 'ai_call',
      who: 'AI agent',
      what: `${a.channel === 'voice' ? 'Voice' : 'SMS'} · ${a.outcome}`,
      referralState: a.state === 'In Progress' ? 'Attempted' : (a.state as ReferralState),
      detail: a.summary ?? undefined,
      channel: a.channel as Channel,
      outcome: a.outcome ?? undefined,
      duration: fmtDuration(a.duration_secs),
      disclosurePlayed: a.disclosure_played,
      escalated: a.outcome === 'Escalated',
      hasTranscript: asTranscript(a.transcript).length > 0,
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
    `select r.state, exists(select 1 from call_attempts a where a.referral_id = r.id) as attempted, count(*)::int as n
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

export async function getSidebarCounts() {
  const counts = await derivedStateCounts();
  let total = 0;
  for (const n of counts.values()) total += n;
  return {
    urgentAlerts: counts.get('Escalated') ?? 0,
    confirmQueue: counts.get('Pending Confirmation') ?? 0,
    referrals: total - (counts.get('Booked') ?? 0),
  };
}

export async function getEscalatedCount(): Promise<number> {
  return (await derivedStateCounts()).get('Escalated') ?? 0;
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

export async function createCapturedSlot(
  referralId: string, slot: { day: string; time: string; provider: string }, actor: Actor,
): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    if (!(await referralExists(tx, referralId))) return { success: false };
    // Only one live captured slot per referral.
    await tx.query(`update appointments set status = 'expired' where referral_id = $1 and status = 'captured'`, [referralId]);
    await tx.query(
      `insert into appointments (referral_id, status, day, time, provider, mirror_status)
       values ($1, 'captured', $2, $3, $4, 'pending')`, [referralId, slot.day, slot.time, slot.provider]);
    await audit(tx, actor, referralId, 'slot.capture', `Captured slot ${slot.day} ${slot.time}`);
    return { success: true };
  });
}

export async function addCallAttempt(
  referralId: string, attempt: Omit<Attempt, 'n'>, actor: Actor,
): Promise<{ success: boolean; errorMsg?: string }> {
  const db = await getDb();
  return db.transaction(async tx => {
    if (!(await referralExists(tx, referralId))) return { success: false, errorMsg: 'Referral not found' };
    await tx.query(
      `insert into call_attempts (referral_id, channel, outcome, duration_secs, disclosure_played, summary, transcript, slot_day)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [referralId, attempt.channel, attempt.outcome, parseDurationToSecs(attempt.duration),
        attempt.disclosurePlayed, attempt.summary, JSON.stringify(attempt.transcript ?? []), attempt.slotDay ?? null]);
    await audit(tx, actor, referralId, 'attempt.add',
      `${attempt.channel === 'voice' ? 'Voice' : 'SMS'} call: ${attempt.outcome} · ${attempt.duration}`);
    return { success: true };
  });
}

export async function patchLatestTranscript(referralId: string, turns: TranscriptTurn[], actor: Actor): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query(
      `update call_attempts set transcript = $2::jsonb
        where id = (select id from call_attempts where referral_id = $1 order by attempted_at desc limit 1)
        returning id`, [referralId, JSON.stringify(turns)]);
    if (rows.length === 0) return { success: false };
    await audit(tx, actor, referralId, 'attempt.transcript', 'Call transcript attached');
    return { success: true };
  });
}

export interface ReferralDraft {
  patientName?: string; dateOfBirth?: string; phone?: string; language?: string;
  insurance?: string; reason?: string; referringProvider?: string; priority?: string;
}

export async function updateReferral(
  referralId: string, draft: ReferralDraft, comment: string | undefined, actor: Actor,
): Promise<Result> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows } = await tx.query<{ patient_id: string }>('select patient_id from referrals where id = $1', [referralId]);
    if (rows.length === 0) return { success: false };
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
    return { success: true };
  });
}

export interface IngestRow {
  patientName: string; dateOfBirth?: string; phone: string; sex?: 'M' | 'F' | '';
  language?: string; insurance?: string; reason?: string; referringProvider?: string;
  priority?: Priority; location?: string;
}

export async function ingestReferrals(rows: IngestRow[], actor: Actor): Promise<{ success: boolean; importedCount: number }> {
  const db = await getDb();
  return db.transaction(async tx => {
    const { rows: maxRows } = await tx.query<{ max: number | null }>(
      `select max(substring(id from 5)::int) as max from referrals where id ~ '^REF-[0-9]+$'`);
    let next = Math.max(maxRows[0]?.max ?? 0, 1042) + 1;
    let importedCount = 0;
    for (const row of rows) {
      if (!row.patientName?.trim() || !row.phone?.trim()) continue;
      const { rows: pt } = await tx.query<{ id: string }>(
        `insert into patients (name, phone, language, insurance, sex, date_of_birth)
         values ($1, $2, $3, $4, $5, $6::date) returning id`,
        [row.patientName.trim(), row.phone.trim(), row.language || 'English', row.insurance ?? '',
          row.sex === 'F' ? 'F' : 'M', mdyToIso(row.dateOfBirth)]);
      const referralId = `REF-${next++}`;
      await tx.query(
        `insert into referrals (id, patient_id, reason, referring_provider, referral_source, location, priority, state)
         values ($1, $2, $3, $4, 'Uploaded batch', $5, $6, 'Queued')`,
        [referralId, pt[0].id, row.reason ?? '', row.referringProvider ?? '', row.location || 'Mission Bay',
          row.priority === 'urgent' ? 'urgent' : 'normal']);
      await audit(tx, actor, referralId, 'referral.ingest', 'Ingested via spreadsheet upload');
      importedCount++;
    }
    return { success: true, importedCount };
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

function sanitizeSettings(raw: unknown): PracticeSettings {
  const c = (raw as { cadence?: Record<string, unknown> } | null)?.cadence ?? {};
  const d = DEFAULT_SETTINGS.cadence;
  const interval = Number(c.intervalMinutes);
  const max = Number(c.maxCallsPerSession);
  const order = c.callOrder as string;
  return {
    cadence: {
      intervalMinutes: Number.isFinite(interval) && interval > 0 && interval <= 1440 ? interval : d.intervalMinutes,
      maxCallsPerSession: Number.isInteger(max) && max > 0 && max <= 500 ? max : d.maxCallsPerSession,
      callOrder: (VALID_CALL_ORDERS as readonly string[]).includes(order)
        ? (order as PracticeSettings['cadence']['callOrder']) : d.callOrder,
    },
  };
}

export async function getSettings(): Promise<PracticeSettings> {
  const db = await getDb();
  const { rows } = await db.query<{ settings: unknown }>(`select settings from practice_settings where id = 'default'`);
  return sanitizeSettings(rows[0]?.settings ?? DEFAULT_SETTINGS);
}

export async function saveSettings(input: unknown, actor: Actor): Promise<PracticeSettings> {
  const settings = sanitizeSettings(input);
  const db = await getDb();
  await db.transaction(async tx => {
    await tx.query(
      `insert into practice_settings (id, settings, updated_at, updated_by) values ('default', $1::jsonb, now(), $2)
       on conflict (id) do update set settings = excluded.settings, updated_at = now(), updated_by = excluded.updated_by`,
      [JSON.stringify(settings), actor.id]);
    await audit(tx, actor, null, 'settings.update', 'Practice settings updated');
  });
  return settings;
}
