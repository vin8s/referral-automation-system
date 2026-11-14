// SMS persistence: every SQL query the texting feature runs. Takes a Queryable so
// the engine can run against the app database or an in-memory test database.

import 'server-only';
import type { Queryable } from '@/server/db';
import type { SessionUser } from '@/lib/auth-types';
import { busySlotsOnGrid } from '@/lib/slots';
import { DEFAULT_OUTREACH_SETTINGS, type OutreachSettings } from './schedule';
import type { Lang } from './templates';
import type { OfferedSlot } from './types';

// ── Actors ──────────────────────────────────────────────────────────────────

export interface AuditActor { id: string | null; name: string | null; role: string }
export const AI_ACTOR: AuditActor = { id: null, name: 'AI agent', role: 'ai' };
export const SYSTEM_ACTOR: AuditActor = { id: null, name: null, role: 'system' };
export const staffActor = (u: SessionUser): AuditActor => ({ id: u.id, name: u.name, role: u.role });

/** Audit lines never contain message bodies (patient words stay in the messages table). */
export async function audit(q: Queryable, actor: AuditActor, referralId: string | null, action: string, what: string): Promise<void> {
  await q.query(
    `insert into audit_log (referral_id, actor_id, actor_name, actor_role, action, what) values ($1,$2,$3,$4,$5,$6)`,
    [referralId, actor.id, actor.name, actor.role, action, what]);
}

// ── Referral + patient ──────────────────────────────────────────────────────

export interface RefCtx {
  id: string;
  state: string;
  priority: string;
  /** Clinical detail. NEVER texted and NEVER sent to the model (outbound guard only). */
  reason: string;
  /** Appointment specialty. Texted only in slot_offer after identity is verified; never sent to the model. */
  specialty: string;
  referringProvider: string;
  location: string;
  patientId: string;
  patientName: string;
  firstName: string;
  dobIso: string | null;
  phone: string;
  language: string;
  consent: boolean;
  consentAt: Date | null;
  consentSource: string | null;
  optedOut: boolean;
  optedOutAt: Date | null;
  optOutSource: string | null;
  escalationReason: string | null;
  /** Pilot mode: when staff approved the first text (null = not approved). */
  outreachApprovedAt: Date | null;
}

const REF_SQL = `
  select r.id, r.state, r.priority, coalesce(r.reason,'') as reason, coalesce(r.specialty,'') as specialty,
         coalesce(r.referring_provider,'') as referring_provider,
         r.location, r.patient_id, r.escalation_reason, r.outreach_approved_at,
         p.name, to_char(p.date_of_birth, 'YYYY-MM-DD') as dob, coalesce(p.phone,'') as phone, p.language,
         p.sms_consent, p.sms_consent_at, p.sms_consent_source, p.sms_opted_out, p.sms_opted_out_at, p.sms_opt_out_source
    from referrals r join patients p on p.id = r.patient_id`;

type RefRow = {
  id: string; state: string; priority: string; reason: string; specialty: string; referring_provider: string; location: string;
  patient_id: string; escalation_reason: string | null; outreach_approved_at: Date | null; name: string; dob: string | null; phone: string; language: string;
  sms_consent: boolean; sms_consent_at: Date | null; sms_consent_source: string | null;
  sms_opted_out: boolean; sms_opted_out_at: Date | null; sms_opt_out_source: string | null;
};

function toRef(r: RefRow): RefCtx {
  return {
    id: r.id, state: r.state, priority: r.priority, reason: r.reason, specialty: r.specialty, referringProvider: r.referring_provider,
    location: r.location, patientId: r.patient_id, patientName: r.name, firstName: r.name.split(/\s+/)[0] ?? r.name,
    dobIso: r.dob, phone: r.phone, language: r.language, consent: r.sms_consent, consentAt: r.sms_consent_at,
    consentSource: r.sms_consent_source, optedOut: r.sms_opted_out, optedOutAt: r.sms_opted_out_at,
    optOutSource: r.sms_opt_out_source, escalationReason: r.escalation_reason,
    outreachApprovedAt: r.outreach_approved_at ?? null,
  };
}

export async function loadRef(q: Queryable, referralId: string): Promise<RefCtx | null> {
  const { rows } = await q.query<RefRow>(`${REF_SQL} where r.id = $1`, [referralId]);
  return rows[0] ? toRef(rows[0]) : null;
}

/** Outreach candidates: referrals still being worked (stored state Queued / In Progress). */
export async function listOutreachCandidates(q: Queryable): Promise<RefCtx[]> {
  const { rows } = await q.query<RefRow>(
    `${REF_SQL} where r.state in ('Queued', 'In Progress') order by (r.priority = 'urgent') desc, r.referral_time asc`);
  return rows.map(toRef);
}

/**
 * Pilot mode: referrals whose first text has not gone out and that no one has
 * approved yet (stored state Queued / In Progress, no outreach cycle started).
 */
export async function listAwaitingApproval(q: Queryable): Promise<(RefCtx & { referralTime: Date })[]> {
  const { rows } = await q.query<RefRow & { referral_time: Date }>(
    `${REF_SQL.replace('select r.id,', 'select r.referral_time, r.id,')}
       left join sms_conversations c on c.referral_id = r.id
      where r.state in ('Queued', 'In Progress') and r.outreach_approved_at is null
        and coalesce(c.cycle_step, 0) = 0 and coalesce(c.outreach_count, 0) = 0
      order by (r.priority = 'urgent') desc, r.referral_time asc`);
  return rows.map(r => ({ ...toRef(r), referralTime: r.referral_time }));
}

/** Marks referrals approved for their first text. Returns the ids that changed. */
export async function approveOutreach(q: Queryable, ids: string[], by: string, now: Date): Promise<string[]> {
  if (!ids.length) return [];
  const { rows } = await q.query<{ id: string }>(
    `update referrals set outreach_approved_at = $2, outreach_approved_by = $3, updated_at = now()
      where id = any($1::text[]) and outreach_approved_at is null returning id`, [ids, now, by]);
  return rows.map(r => r.id);
}

/** Finds the referral an inbound text belongs to: same phone, most recently texted first. */
export async function findReferralByPhone(q: Queryable, phoneKey: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `select r.id from referrals r join patients p on p.id = r.patient_id
       left join sms_conversations c on c.referral_id = r.id
      where right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = $1
      order by c.last_outbound_at desc nulls last, r.referral_time desc limit 1`, [phoneKey]);
  return rows[0]?.id ?? null;
}

export function langFromPatient(language: string): Lang | null {
  const l = language.toLowerCase();
  if (l.startsWith('span') || l === 'es' || l.startsWith('espa')) return 'es';
  if (l.startsWith('eng') || l === 'en' || l === '') return 'en';
  return null;
}

export async function setOptOut(q: Queryable, patientId: string, optedOut: boolean, source: string, now: Date): Promise<void> {
  if (optedOut) {
    await q.query(
      `update patients set sms_opted_out = true, sms_opted_out_at = $2, sms_opt_out_source = $3 where id = $1`,
      [patientId, now, source]);
  } else {
    await q.query(
      `update patients set sms_opted_out = false, sms_opted_out_at = null, sms_opt_out_source = null,
              sms_consent = true, sms_consent_at = $2, sms_consent_source = $3 where id = $1`,
      [patientId, now, source]);
  }
}

export async function setConsent(q: Queryable, patientId: string, consent: boolean, source: string, now: Date): Promise<void> {
  if (consent) {
    // New written/verbal consent recorded by staff also lifts an earlier opt-out (R6.4).
    await q.query(
      `update patients set sms_consent = true, sms_consent_at = $2, sms_consent_source = $3,
              sms_opted_out = false, sms_opted_out_at = null, sms_opt_out_source = null where id = $1`,
      [patientId, now, source]);
  } else {
    await q.query(
      `update patients set sms_consent = false, sms_consent_at = $2, sms_consent_source = $3 where id = $1`,
      [patientId, now, source]);
  }
}

export async function escalateReferral(q: Queryable, referralId: string, reason: string, now: Date): Promise<void> {
  await q.query(
    `update referrals set state = 'Escalated', escalation_reason = $2, escalation_severity = 'high',
            escalation_raised_at = $3, escalation_owner = null, updated_at = $3 where id = $1`,
    [referralId, reason.slice(0, 500), now]);
}

export async function setReferralState(q: Queryable, referralId: string, state: string, now: Date): Promise<void> {
  await q.query(`update referrals set state = $2, updated_at = $3 where id = $1`, [referralId, state, now]);
}

// ── Conversation ────────────────────────────────────────────────────────────

export interface Conv {
  referralId: string;
  lockedLanguage: Lang | null;
  identityVerified: boolean;
  identityVerifiedAt: Date | null;
  identityAttempts: number;
  offeredSlots: OfferedSlot[];
  rejectedSlotKeys: string[];
  capturedSlotId: string | null;
  preferences: unknown;
  friction: string[];
  outreachCount: number;
  cycleStep: number;
  cycleStartedAt: Date | null;
  lastOutreachAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  repliedSinceOutreach: boolean;
  paused: boolean;
  pausedReason: string | null;
  channelPreference: 'sms' | 'none';
  numberSuppressed: boolean;
  redirectsUsed: number;
  aiMessagesDay: string | null;
  aiMessagesToday: number;
  exhausted: boolean;
}

type ConvRow = Record<string, unknown>;

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};

function toConv(r: ConvRow): Conv {
  return {
    referralId: r.referral_id as string,
    lockedLanguage: (r.locked_language as Lang | null) ?? null,
    identityVerified: r.identity_verified as boolean,
    identityVerifiedAt: (r.identity_verified_at as Date | null) ?? null,
    identityAttempts: r.identity_attempts as number,
    offeredSlots: json<OfferedSlot[]>(r.offered_slots, []),
    rejectedSlotKeys: json<string[]>(r.rejected_slot_keys, []),
    capturedSlotId: (r.captured_slot_id as string | null) ?? null,
    preferences: json<unknown>(r.preferences, null),
    friction: json<string[]>(r.friction, []),
    outreachCount: r.outreach_count as number,
    cycleStep: r.cycle_step as number,
    cycleStartedAt: (r.cycle_started_at as Date | null) ?? null,
    lastOutreachAt: (r.last_outreach_at as Date | null) ?? null,
    lastInboundAt: (r.last_inbound_at as Date | null) ?? null,
    lastOutboundAt: (r.last_outbound_at as Date | null) ?? null,
    repliedSinceOutreach: r.replied_since_outreach as boolean,
    paused: r.paused as boolean,
    pausedReason: (r.paused_reason as string | null) ?? null,
    // Legacy 'voice' rows (pre-004) mean "don't auto-text": treat them as 'none'.
    channelPreference: r.channel_preference === 'sms' ? 'sms' : 'none',
    numberSuppressed: r.number_suppressed as boolean,
    redirectsUsed: r.redirects_used as number,
    aiMessagesDay: (r.ai_messages_day as string | null) ?? null,
    aiMessagesToday: r.ai_messages_today as number,
    exhausted: r.exhausted as boolean,
  };
}

export async function getConv(q: Queryable, referralId: string): Promise<Conv> {
  await q.query(`insert into sms_conversations (referral_id) values ($1) on conflict (referral_id) do nothing`, [referralId]);
  const { rows } = await q.query<ConvRow>(`select * from sms_conversations where referral_id = $1`, [referralId]);
  return toConv(rows[0]);
}

export async function findConv(q: Queryable, referralId: string): Promise<Conv | null> {
  const { rows } = await q.query<ConvRow>(`select * from sms_conversations where referral_id = $1`, [referralId]);
  return rows[0] ? toConv(rows[0]) : null;
}

const CONV_COLUMNS: Record<keyof Omit<Conv, 'referralId'>, { col: string; json?: boolean }> = {
  lockedLanguage: { col: 'locked_language' }, identityVerified: { col: 'identity_verified' },
  identityVerifiedAt: { col: 'identity_verified_at' }, identityAttempts: { col: 'identity_attempts' },
  offeredSlots: { col: 'offered_slots', json: true }, rejectedSlotKeys: { col: 'rejected_slot_keys', json: true },
  capturedSlotId: { col: 'captured_slot_id' }, preferences: { col: 'preferences', json: true },
  friction: { col: 'friction', json: true }, outreachCount: { col: 'outreach_count' }, cycleStep: { col: 'cycle_step' },
  cycleStartedAt: { col: 'cycle_started_at' }, lastOutreachAt: { col: 'last_outreach_at' },
  lastInboundAt: { col: 'last_inbound_at' }, lastOutboundAt: { col: 'last_outbound_at' },
  repliedSinceOutreach: { col: 'replied_since_outreach' }, paused: { col: 'paused' }, pausedReason: { col: 'paused_reason' },
  channelPreference: { col: 'channel_preference' }, numberSuppressed: { col: 'number_suppressed' },
  redirectsUsed: { col: 'redirects_used' }, aiMessagesDay: { col: 'ai_messages_day' },
  aiMessagesToday: { col: 'ai_messages_today' }, exhausted: { col: 'exhausted' },
};

export async function updateConv(q: Queryable, referralId: string, patch: Partial<Omit<Conv, 'referralId'>>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [referralId];
  for (const [k, v] of Object.entries(patch)) {
    const c = CONV_COLUMNS[k as keyof typeof CONV_COLUMNS];
    if (!c || v === undefined) continue;
    params.push(c.json ? JSON.stringify(v) : v);
    sets.push(`${c.col} = $${params.length}${c.json ? '::jsonb' : ''}`);
  }
  if (!sets.length) return;
  await q.query(`update sms_conversations set ${sets.join(', ')}, updated_at = now() where referral_id = $1`, params);
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  referral_id: string | null;
  direction: 'inbound' | 'outbound';
  author: 'patient' | 'template' | 'ai' | 'staff' | 'system';
  body: string;
  template_key: string | null;
  status: string;
  segments: number | null;
  encoding: string | null;
  send_after: Date | null;
  sent_by: string | null;
  created_at: Date;
  sent_at: Date | null;
  to_number: string | null;
  provider_message_id: string | null;
  error_code: string | null;
}

export async function insertMessage(q: Queryable, m: {
  referralId: string | null; patientId: string | null; direction: 'inbound' | 'outbound';
  author: MessageRow['author']; body: string; templateKey?: string | null; status: string;
  provider?: string | null; providerMessageId?: string | null; segments?: number | null; encoding?: string | null;
  fromNumber?: string | null; toNumber?: string | null; sendAfter?: Date | null; sentBy?: string | null;
  errorCode?: string | null; createdAt: Date; sentAt?: Date | null;
}): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `insert into messages (referral_id, patient_id, direction, author, body, template_key, status, provider,
       provider_message_id, segments, encoding, from_number, to_number, send_after, sent_by, error_code, created_at, sent_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     on conflict (provider, provider_message_id) where provider_message_id is not null do nothing
     returning id`,
    [m.referralId, m.patientId, m.direction, m.author, m.body, m.templateKey ?? null, m.status, m.provider ?? null,
      m.providerMessageId ?? null, m.segments ?? null, m.encoding ?? null, m.fromNumber ?? null, m.toNumber ?? null,
      m.sendAfter ?? null, m.sentBy ?? null, m.errorCode ?? null, m.createdAt, m.sentAt ?? null]);
  return rows[0]?.id ?? null;
}

export async function updateMessageStatus(q: Queryable, id: string, patch: {
  status: string; provider?: string; providerMessageId?: string | null; sentAt?: Date | null; errorCode?: string | null;
}): Promise<void> {
  await q.query(
    `update messages set status = $2, provider = coalesce($3, provider), provider_message_id = coalesce($4, provider_message_id),
            sent_at = coalesce($5, sent_at), error_code = $6, send_after = case when $2 = 'held' then send_after else null end
      where id = $1`,
    [id, patch.status, patch.provider ?? null, patch.providerMessageId ?? null, patch.sentAt ?? null, patch.errorCode ?? null]);
}

export async function listMessages(q: Queryable, referralId: string, opts: { sinceDays?: number; now?: Date; limit?: number } = {}): Promise<MessageRow[]> {
  const params: unknown[] = [referralId];
  let where = 'referral_id = $1';
  if (opts.sinceDays && opts.now) {
    params.push(new Date(opts.now.getTime() - opts.sinceDays * 86400_000));
    where += ` and created_at >= $${params.length}`;
  }
  const { rows } = await q.query<MessageRow>(
    `select * from (select * from messages where ${where} order by created_at desc, id desc limit ${opts.limit ?? 500}) m
      order by created_at asc, id asc`, params);
  return rows;
}

export async function listDueHeld(q: Queryable, now: Date): Promise<MessageRow[]> {
  const { rows } = await q.query<MessageRow>(
    `select * from messages where status = 'held' and send_after <= $1 order by created_at asc limit 200`, [now]);
  return rows;
}

// ── SMS attempts in call_attempts (one row per outreach text; replies update it) ──

export async function openSmsAttempt(q: Queryable, referralId: string, at: Date, summary: string): Promise<void> {
  await q.query(
    `insert into call_attempts (referral_id, attempted_at, channel, outcome, disclosure_played, summary, transcript)
     values ($1, $2, 'sms', 'No Answer', true, $3, '[]'::jsonb)`, [referralId, at, summary]);
}

async function latestSmsAttemptId(q: Queryable, referralId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `select id from call_attempts where referral_id = $1 and channel = 'sms' order by attempted_at desc, id desc limit 1`, [referralId]);
  return rows[0]?.id ?? null;
}

/** Appends a turn to the latest SMS attempt's transcript (creates an attempt if the patient texted first). */
export async function appendSmsTurn(q: Queryable, referralId: string, who: 'ai' | 'patient', text: string, at: Date): Promise<void> {
  let id = await latestSmsAttemptId(q, referralId);
  if (!id) {
    await openSmsAttempt(q, referralId, at, 'Patient texted the clinic');
    id = await latestSmsAttemptId(q, referralId);
  }
  await q.query(
    `update call_attempts set transcript = coalesce(transcript, '[]'::jsonb) || $2::jsonb where id = $1`,
    [id, JSON.stringify([{ who, text }])]);
}

export async function setSmsAttemptOutcome(q: Queryable, referralId: string, outcome: string, summary?: string, slotDay?: string): Promise<void> {
  const id = await latestSmsAttemptId(q, referralId);
  if (!id) return;
  await q.query(
    `update call_attempts set outcome = $2, summary = coalesce($3, summary), slot_day = coalesce($4, slot_day) where id = $1`,
    [id, outcome, summary ?? null, slotDay ?? null]);
}

// ── Appointments (captured slots) ───────────────────────────────────────────

/**
 * Times that must not be offered: captured/confirmed slots in Relay plus busy times
 * from the latest eCW schedule import (ecw_busy_slots, mapped onto the slot grid).
 */
export async function takenSlots(q: Queryable): Promise<{ day: string; time: string }[]> {
  const [{ rows }, busy] = await Promise.all([
    q.query<{ day: string; time: string }>(
      `select day, time from appointments where status in ('captured', 'confirmed') and day is not null and time is not null`),
    q.query<{ local_date: string; start_min: number; duration_min: number }>(
      `select to_char(local_date, 'YYYY-MM-DD') as local_date, start_min, duration_min from ecw_busy_slots
        where local_date >= current_date - 1`),
  ]);
  return [...rows, ...busySlotsOnGrid(busy.rows.map(b => ({ date: b.local_date, startMin: b.start_min, durationMin: b.duration_min })))];
}

/** Held (quiet-hours) texts for a referral that must no longer go out, e.g. it was booked in eCW. */
export async function suppressHeldTexts(q: Queryable, referralId: string, why: string): Promise<number> {
  const { rows } = await q.query(
    `update messages set status = 'suppressed', error_code = $2, send_after = null
      where referral_id = $1 and status = 'held' returning id`, [referralId, why]);
  return rows.length;
}

export async function captureSlot(q: Queryable, referralId: string, slot: OfferedSlot, now: Date): Promise<void> {
  await q.query(`update appointments set status = 'expired' where referral_id = $1 and status = 'captured'`, [referralId]);
  await q.query(
    `insert into appointments (referral_id, status, day, time, provider, captured_at, mirror_status)
     values ($1, 'captured', $2, $3, $4, $5, 'pending')`, [referralId, slot.day, slot.time, slot.provider, now]);
}

export async function confirmedAppointment(q: Queryable, referralId: string): Promise<{ day: string; time: string; provider: string } | null> {
  const { rows } = await q.query<{ day: string; time: string; provider: string }>(
    `select day, time, provider from appointments where referral_id = $1 and status = 'confirmed' order by confirmed_at desc limit 1`, [referralId]);
  return rows[0] ?? null;
}

// ── Needs-a-human (amber) ───────────────────────────────────────────────────

export interface NeedsHumanRow {
  id: string; referral_id: string; reason_code: string; summary: string | null; pause_automation: boolean;
  source: string; created_at: Date; resolved_at: Date | null; resolved_by: string | null;
}

/** Adds an amber item unless an open one with the same reason already exists. Returns true if added. */
export async function addNeedsHuman(q: Queryable, referralId: string, code: string, summary: string | null, pause: boolean, now: Date): Promise<boolean> {
  const { rows } = await q.query(
    `select 1 from needs_human_items where referral_id = $1 and reason_code = $2 and resolved_at is null`, [referralId, code]);
  if (rows.length) {
    if (summary) await q.query(
      `update needs_human_items set summary = $3 where referral_id = $1 and reason_code = $2 and resolved_at is null`,
      [referralId, code, summary.slice(0, 400)]);
    return false;
  }
  await q.query(
    `insert into needs_human_items (referral_id, reason_code, summary, pause_automation, created_at) values ($1,$2,$3,$4,$5)`,
    [referralId, code, summary?.slice(0, 400) ?? null, pause, now]);
  return true;
}

export async function listOpenNeedsHuman(q: Queryable, referralId?: string): Promise<(NeedsHumanRow & { patient: string })[]> {
  const { rows } = await q.query<NeedsHumanRow & { patient: string }>(
    `select n.*, p.name as patient from needs_human_items n join referrals r on r.id = n.referral_id
       join patients p on p.id = r.patient_id
      where n.resolved_at is null ${referralId ? 'and n.referral_id = $1' : ''} order by n.created_at desc`,
    referralId ? [referralId] : []);
  return rows;
}

export async function resolveNeedsHuman(q: Queryable, itemId: string, by: string, now: Date): Promise<string | null> {
  const { rows } = await q.query<{ referral_id: string }>(
    `update needs_human_items set resolved_at = $2, resolved_by = $3 where id = $1 and resolved_at is null returning referral_id`,
    [itemId, now, by]);
  return rows[0]?.referral_id ?? null;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function loadOutreachSettings(q: Queryable): Promise<OutreachSettings & { updatedAt: Date | null; updatedBy: string | null }> {
  const { rows } = await q.query<Record<string, unknown>>(`select * from sms_settings where id = 'default'`);
  const r = rows[0];
  if (!r) return { ...DEFAULT_OUTREACH_SETTINGS, updatedAt: null, updatedBy: null };
  return {
    textingPaused: r.texting_paused as boolean,
    approvalRequired: r.approval_required === undefined ? true : (r.approval_required as boolean),
    quietStart: r.quiet_start as string,
    quietEnd: r.quiet_end as string,
    allowedDays: json<number[]>(r.allowed_days, DEFAULT_OUTREACH_SETTINGS.allowedDays),
    holidays: json<string[]>(r.holidays, []),
    cadenceDays: json<number[]>(r.cadence_days, DEFAULT_OUTREACH_SETTINGS.cadenceDays),
    lifetimeCap: r.lifetime_cap as number,
    minSpacingHours: r.min_spacing_hours as number,
    exhaustedAfterHours: r.exhausted_after_hours as number,
    aiDailyCap: r.ai_daily_cap as number,
    updatedAt: (r.updated_at as Date) ?? null,
    updatedBy: (r.updated_by as string) ?? null,
  };
}

export async function saveOutreachSettings(q: Queryable, s: OutreachSettings, by: string): Promise<void> {
  await q.query(
    `insert into sms_settings (id, texting_paused, quiet_start, quiet_end, allowed_days, holidays, cadence_days,
        lifetime_cap, min_spacing_hours, exhausted_after_hours, ai_daily_cap, updated_at, updated_by, approval_required)
     values ('default', $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, now(), $11, $12)
     on conflict (id) do update set texting_paused = excluded.texting_paused, quiet_start = excluded.quiet_start,
        quiet_end = excluded.quiet_end, allowed_days = excluded.allowed_days, holidays = excluded.holidays,
        cadence_days = excluded.cadence_days, lifetime_cap = excluded.lifetime_cap,
        min_spacing_hours = excluded.min_spacing_hours, exhausted_after_hours = excluded.exhausted_after_hours,
        ai_daily_cap = excluded.ai_daily_cap, updated_at = now(), updated_by = excluded.updated_by,
        approval_required = excluded.approval_required`,
    [s.textingPaused, s.quietStart, s.quietEnd, JSON.stringify(s.allowedDays), JSON.stringify(s.holidays),
      JSON.stringify(s.cadenceDays), s.lifetimeCap, s.minSpacingHours, s.exhaustedAfterHours, s.aiDailyCap, by,
      s.approvalRequired]);
}

// ── Inbound de-dupe ─────────────────────────────────────────────────────────

/** Records an SNS MessageId; false if it was already processed. */
export async function claimInboundEvent(q: Queryable, snsMessageId: string): Promise<boolean> {
  const { rows } = await q.query(
    `insert into sms_inbound_events (sns_message_id) values ($1) on conflict do nothing returning sns_message_id`, [snsMessageId]);
  return rows.length > 0;
}


