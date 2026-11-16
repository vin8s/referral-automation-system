// SMS conversation engine: the per-turn flow from docs/SMS_AGENT_PROMPT.md §1.1,
// the precedence rules (§1.3) and the safety rules in docs/AGENT_SAFETY_RULES.md.
//
// Nothing here books an appointment: a captured slot goes to the MA confirm queue
// (Pending Confirmation). Red = referral Escalated + texting paused. Amber = a
// needs-a-human item; the referral state does not change.
//
// All dependencies (database, SMS provider, model, clock) come in through SmsDeps so
// tests can run the real flow against an in-memory database and a scripted model.

import { isAllowedNumber } from './allowlist';
import 'server-only';
import type { Db, Queryable } from '@/server/db';
import { logError } from '@/server/log';
import { slotKey, takenSlotKeys } from '@/lib/slots';
import {
  detectEmergency, detectKeyword, dobMatches, pickDobCandidate, redTemplateFor, resolveDecision, validateModelOutput, validateOutgoing,
} from './guards';
import type { SmsAgentModel } from './model';
import { phoneKey, type SmsProvider } from './provider';
import { measureSms } from './segments';
import * as repo from './repo';
import { AI_ACTOR, SYSTEM_ACTOR, type AuditActor, type Conv, type RefCtx } from './repo';
import { ageOn, isWithinSendWindow, localDate, nextSendWindow, zonedParts, type OutreachSettings } from './schedule';
import { buildOfferedSlots, buildOpenSlotPool } from './slots';
import { specialtyPhrase } from './specialty';
import { IMMEDIATE_TEMPLATES, renderTemplate, type Lang, type TemplateId, type TemplateVars } from './templates';
import type { HistoryTurn, ModelInput, OfferedSlot, RedCode, SmsTurnOutput, TurnContext } from './types';

export interface SmsDeps {
  db: Db;
  provider: SmsProvider;
  model: SmsAgentModel;
  now: () => Date;
  tz: string;
  clinicName: string;
  clinicPhone: string;
  /** Provider names used when offering slots. */
  providers: string[];
  /** Practice specialty — never sent to the model, only used by the outbound guard. */
  specialty: string;
  /** Upper bound for one model call (default MODEL_TIMEOUT_MS). Tests set it low. */
  modelTimeoutMs?: number;
  /** Upper bound for one provider send (default SEND_TIMEOUT_MS). Tests set it low. */
  sendTimeoutMs?: number;
}

export const REVERIFY_AFTER_DAYS = 7;          // R4.4
const HISTORY_DAYS = 30;                       // SMS_AGENT_PROMPT §1.1
const HISTORY_MAX_TURNS = 40;
const STAFF_MAX_CHARS = 640;
/**
 * The Bedrock adapter aborts each Converse call at 25 s and may make two (no-tool retry),
 * so 60 s only trips when something below it hangs. Without a bound, a hung call would
 * hold this patient's inbound lock (below) forever and every later text would queue behind it.
 */
const MODEL_TIMEOUT_MS = 60_000;
/** The AWS SDK has no request timeout by default; a hung send must not hang the turn. */
const SEND_TIMEOUT_MS = 20_000;
/** Inbound texts still marked "processing" after this long are raised to staff by the sweeper. */
const UNPROCESSED_AFTER_MS = 5 * 60_000;
/** Marker on an inbound message row until its turn finishes (cleared on success or after an amber). */
const PROCESSING = 'processing';

// ── Robustness helpers ──────────────────────────────────────────────────────

/**
 * Makes text safe to store. Postgres rejects NUL (0x00) in text and in jsonb, and jsonb
 * rejects lone UTF-16 surrogates (e.g. "\ud83d" in an SNS payload, or an emoji cut in
 * half by .slice). Either used to throw mid-turn — after the inbound row was stored — so
 * the patient got no reply and SNS retries were de-duped away (silent drop).
 * Zero-width characters are removed so they can't split "STOP" or an emergency phrase.
 */
export function cleanText(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

/** cleanText applied to every string inside the model's raw tool output (it lands in text + jsonb columns). */
function cleanDeep(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return cleanText(v);
  if (depth > 6 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => cleanDeep(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, cleanDeep(x, depth + 1)]));
}

/** Rejects with a TimeoutError after `ms`. The late promise's own rejection is swallowed (no unhandled rejection). */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  p.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} timed out after ${ms} ms`), { name: 'TimeoutError' })), ms);
    timer.unref?.();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One inbound turn at a time per referral (this server process; production runs one task).
 * Two texts sent seconds apart ("03/04" … "1980", or "1" twice) used to run in parallel:
 * both read the same conversation row, both called the model and both replied, so the
 * patient got two answers, the DOB attempt counter lost an increment and two "captured"
 * appointments could be written. Now the second turn waits and sees the first in history.
 */
const inboundLocks = (globalThis as unknown as { __relayInboundLocks?: Map<string, Promise<unknown>> });
async function withReferralLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (inboundLocks.__relayInboundLocks ??= new Map());
  const run = (locks.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

/**
 * What one inbound turn did, so the turn can tell "replied / staff told" from silence.
 * Keyed by the per-turn copy of SmsDeps that handleInbound passes down.
 */
interface TurnTrace { sends: SendStatus[]; alerts: number }
const traces = new WeakMap<SmsDeps, TurnTrace>();

// ── Helpers ─────────────────────────────────────────────────────────────────

function langFor(ref: RefCtx, conv: Conv): Lang {
  return conv.lockedLanguage ?? repo.langFromPatient(ref.language) ?? 'en';
}

function baseVars(d: SmsDeps, ref: RefCtx): TemplateVars {
  return { patient_first_name: ref.firstName, clinic_name: d.clinicName, clinic_phone: d.clinicPhone, location_short: ref.location };
}

function slotLabel(slot: OfferedSlot, lang: Lang): string {
  return lang === 'es' ? slot.label_es : slot.label_en;
}

function slotVars(slots: OfferedSlot[], lang: Lang): TemplateVars {
  return { slot_1: slots[0] && slotLabel(slots[0], lang), slot_2: slots[1] && slotLabel(slots[1], lang), slot_3: slots[2] && slotLabel(slots[2], lang) };
}

function fmtLocal(at: Date, tz: string): string {
  return at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz });
}

function identityStillValid(conv: Conv, now: Date): boolean {
  return conv.identityVerified && !!conv.identityVerifiedAt
    && now.getTime() - conv.identityVerifiedAt.getTime() <= REVERIFY_AFTER_DAYS * 86400_000;
}

async function freshSlots(d: SmsDeps, q: Queryable, conv: Conv): Promise<OfferedSlot[]> {
  const taken = takenSlotKeys(await repo.takenSlots(q));
  return buildOfferedSlots({
    now: d.now(), tz: d.tz, takenKeys: taken, excludeKeys: new Set(conv.rejectedSlotKeys), providers: d.providers,
  });
}

/** Other free times (next 10 weekdays) the AI may suggest when the offered ones don't work. */
async function openSlotPool(d: SmsDeps, q: Queryable, conv: Conv): Promise<OfferedSlot[]> {
  const taken = takenSlotKeys(await repo.takenSlots(q));
  const offered = new Set(conv.offeredSlots.map(s => s.slot_id));
  return buildOpenSlotPool({
    now: d.now(), tz: d.tz, takenKeys: taken, excludeKeys: new Set(conv.rejectedSlotKeys), providers: d.providers,
  }).filter(s => !offered.has(s.slot_id));
}

async function raiseAmber(d: SmsDeps, ref: RefCtx, code: string, summary: string | null, pause: boolean, actor: AuditActor = AI_ACTOR) {
  const q = d.db;
  const added = await repo.addNeedsHuman(q, ref.id, code, summary, pause, d.now());
  const trace = traces.get(d);
  if (trace) trace.alerts++;
  if (pause) await repo.updateConv(q, ref.id, { paused: true, pausedReason: `amber:${code}` });
  if (added) await repo.audit(q, actor, ref.id, 'sms.needs_human', `Needs a human (${code.replaceAll('_', ' ')})${pause ? ' · texting paused' : ''}`);
}

async function raiseRed(d: SmsDeps, ref: RefCtx, code: RedCode, summary: string) {
  const q = d.db;
  await repo.escalateReferral(q, ref.id, `${code.replaceAll('_', ' ')} (SMS): ${summary}`, d.now());
  const trace = traces.get(d);
  if (trace) trace.alerts++;
  await repo.updateConv(q, ref.id, { paused: true, pausedReason: `red:${code}` });
  await repo.setSmsAttemptOutcome(q, ref.id, 'Escalated', `Escalated by SMS agent (${code.replaceAll('_', ' ')}).`);
  await repo.audit(q, AI_ACTOR, ref.id, 'sms.escalate', `Escalated — ${code.replaceAll('_', ' ')} (SMS). All texting paused.`);
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface SendOptions {
  body: string;
  author: 'template' | 'ai' | 'staff' | 'system';
  templateKey?: string | null;
  /** Bypasses quiet hours (R7.2 immediate templates). */
  immediate?: boolean;
  /** stop_confirmation must still go to a number that has just opted out. */
  allowOptedOut?: boolean;
  /** wrong_number reply goes to a number that has just been suppressed. */
  allowSuppressed?: boolean;
  actor?: AuditActor;
  sentBy?: string | null;
}

export type SendStatus = 'sent' | 'delivered' | 'held' | 'suppressed' | 'failed';

/** Records the message and sends it now, holds it for the next window, or suppresses it. */
export async function sendSms(d: SmsDeps, ref: RefCtx, opts: SendOptions): Promise<SendStatus> {
  const q = d.db;
  const now = d.now();
  const conv = await repo.getConv(q, ref.id);
  const settings = await repo.loadOutreachSettings(q);
  const latest = await repo.loadRef(q, ref.id) ?? ref; // opt-out may have changed this turn
  opts = { ...opts, body: cleanText(opts.body) };
  const seg = measureSms(opts.body);
  const trace = traces.get(d);
  const isSafety = !!opts.templateKey && IMMEDIATE_TEMPLATES.has(opts.templateKey);
  const base = {
    referralId: ref.id, patientId: ref.patientId, direction: 'outbound' as const, author: opts.author, body: opts.body,
    templateKey: opts.templateKey ?? null, segments: seg.segments, encoding: seg.encoding, toNumber: ref.phone,
    createdAt: now, sentBy: opts.sentBy ?? null,
  };

  let suppressedWhy: string | null = null;
  if (!ref.phone) suppressedWhy = 'no phone number';
  else if (latest.optedOut && !opts.allowOptedOut) suppressedWhy = 'patient opted out';
  else if (conv.numberSuppressed && !opts.allowSuppressed) suppressedWhy = 'number suppressed (wrong number)';
  else if (settings.textingPaused && !isSafety) suppressedWhy = 'all texting paused';
  else if (!isAllowedNumber(ref.phone)) suppressedWhy = 'not on the test-phone allowlist';
  if (suppressedWhy) {
    await repo.insertMessage(q, { ...base, status: 'suppressed', errorCode: suppressedWhy });
    await repo.audit(q, opts.actor ?? AI_ACTOR, ref.id, 'sms.suppressed', `Text not sent (${suppressedWhy})`);
    trace?.sends.push('suppressed');
    return 'suppressed';
  }

  if (!opts.immediate && !isWithinSendWindow(now, settings, d.tz)) {
    const at = nextSendWindow(now, settings, d.tz);
    await repo.insertMessage(q, { ...base, status: 'held', sendAfter: at });
    await repo.updateConv(q, ref.id, { lastOutboundAt: now });
    await repo.appendSmsTurn(q, ref.id, 'ai', opts.body, now);
    await repo.audit(q, opts.actor ?? AI_ACTOR, ref.id, 'sms.held',
      `Text held for quiet hours until ${fmtLocal(at, d.tz)}${opts.templateKey ? ` (${opts.templateKey})` : ''}`);
    trace?.sends.push('held');
    return 'held';
  }

  const id = await repo.insertMessage(q, { ...base, status: 'sending' });
  const status = await deliver(d, id!, ref.phone, opts.body);
  // Recorded before the bookkeeping below so a later DB error can't hide that a text already went out.
  trace?.sends.push(status);
  await repo.updateConv(q, ref.id, { lastOutboundAt: now });
  await repo.appendSmsTurn(q, ref.id, 'ai', opts.author === 'staff' ? `[Staff] ${opts.body}` : opts.body, now);
  await repo.audit(q, opts.actor ?? AI_ACTOR, ref.id, status === 'failed' ? 'sms.failed' : 'sms.sent',
    `${status === 'failed' ? 'Text failed' : 'Text sent'}${opts.templateKey ? ` (${opts.templateKey})` : opts.author === 'ai' ? ' (AI reply)' : opts.author === 'staff' ? ' (staff)' : ''}`);
  return status;
}

/**
 * Sends one text. Exactly one provider attempt: an error (or a timeout, where the text
 * may still have gone out) marks the row failed and is never retried here, so a patient
 * can't get the same text twice. Callers raise an amber item for failed sends.
 */
async function deliver(d: SmsDeps, messageId: string, to: string, body: string): Promise<SendStatus> {
  try {
    const res = await withTimeout(Promise.resolve().then(() => d.provider.send({ to, body })), d.sendTimeoutMs ?? SEND_TIMEOUT_MS, 'sms send');
    await repo.updateMessageStatus(d.db, messageId, {
      status: res.status, provider: d.provider.name, providerMessageId: res.providerMessageId, sentAt: d.now(),
    });
    return res.status;
  } catch (err) {
    logError('sms send', err);
    const e = err as { name?: string };
    await repo.updateMessageStatus(d.db, messageId, { status: 'failed', provider: d.provider.name, errorCode: e?.name ?? 'Error' });
    return 'failed';
  }
}

export async function sendTemplate(
  d: SmsDeps, ref: RefCtx, id: TemplateId, lang: Lang, extra: TemplateVars = {},
  opts: Partial<SendOptions> = {},
): Promise<SendStatus> {
  const vars: TemplateVars = { ...baseVars(d, ref), ...extra };
  if (id === 'slot_offer') {
    // The only text that names the specialty, and only after the DOB is verified
    // (owner decision 2026-11-14). Callers already check this; re-check here so no
    // path can ever offer times (or the specialty) to an unverified number.
    const conv = await repo.findConv(d.db, ref.id);
    if (!conv?.identityVerified) {
      logError('slot_offer blocked', new Error(`slot_offer requested for ${ref.id} before identity verification`));
      await repo.audit(d.db, SYSTEM_ACTOR, ref.id, 'sms.blocked', 'Time offer blocked: identity not verified');
      return 'suppressed';
    }
    vars.specialty_phrase = specialtyPhrase(ref.specialty, lang);
  } else {
    delete vars.specialty_phrase;
  }
  const { text } = renderTemplate(id, lang, vars);
  return sendSms(d, ref, { body: text, author: 'template', templateKey: id, immediate: IMMEDIATE_TEMPLATES.has(id), ...opts });
}

/** Sends previously held messages whose window has opened (called by the outreach tick). */
export async function flushHeld(d: SmsDeps, settings: OutreachSettings): Promise<number> {
  const now = d.now();
  if (settings.textingPaused || !isWithinSendWindow(now, settings, d.tz)) return 0;
  let n = 0;
  for (const m of await repo.listDueHeld(d.db, now)) {
    if (!m.referral_id) continue;
    // One bad row must not stop the other held texts (or the rest of the outreach tick).
    try {
      const ref = await repo.loadRef(d.db, m.referral_id);
      const conv = ref && await repo.findConv(d.db, ref.id);
      if (!ref || !conv || ref.optedOut || conv.numberSuppressed || !isAllowedNumber(ref.phone)) {
        await repo.updateMessageStatus(d.db, m.id, { status: 'suppressed', errorCode: 'no longer allowed to text' });
        continue;
      }
      await repo.updateMessageStatus(d.db, m.id, { status: 'sending' });
      const s = await deliver(d, m.id, ref.phone, m.body);
      await repo.audit(d.db, SYSTEM_ACTOR, ref.id, s === 'failed' ? 'sms.failed' : 'sms.sent',
        `Held text ${s === 'failed' ? 'failed' : 'sent'}${m.template_key ? ` (${m.template_key})` : ''}`);
      if (s !== 'failed') n++;
      // A held reply that fails would otherwise just sit as "failed" in the thread: tell staff.
      else await raiseAmber(d, ref, 'agent_error', 'A text held for quiet hours could not be sent. Please read the thread and contact the patient.', true, SYSTEM_ACTOR);
    } catch (err) {
      logError('sms flush held', err);
    }
  }
  return n;
}

// ── Inbound turn ────────────────────────────────────────────────────────────

export interface InboundInput {
  from: string;
  body: string;
  provider?: string;
  providerMessageId?: string | null;
  /** Patient simulator: the referral is already known. */
  referralId?: string;
}

export interface InboundResult {
  referralId: string | null;
  duplicate?: boolean;
  outcome: string;
  /** Internal: this outcome legitimately sends nothing and raises nothing (stripped before returning). */
  silentOk?: boolean;
}

/**
 * Handles one inbound text. Never throws once the text is stored: any failure after that
 * becomes an amber agent_error item (and, if even that can't be written, the row keeps its
 * "processing" marker and sweepUnprocessedInbound raises it on the next outreach tick).
 * It only throws when the text could not be stored at all, so the webhook returns 5xx and
 * SNS retries a delivery that genuinely did nothing.
 */
export async function handleInbound(d: SmsDeps, input: InboundInput): Promise<InboundResult> {
  const q = d.db;
  const from = String(input.from ?? '');
  const body = cleanText(input.body);
  const key = phoneKey(from);
  // A sender without a full phone number (empty, alphanumeric, short code) must never match:
  // phoneKey('') is '' and used to match the first patient with NO phone on file.
  const referralId = input.referralId ?? (key.length === 10 ? await repo.findReferralByPhone(q, key) : null);
  const ref = referralId ? await repo.loadRef(q, referralId) : null;
  if (!ref) {
    const stored = await repo.insertMessage(q, {
      referralId: null, patientId: null, direction: 'inbound', author: 'patient',
      body: cleanText(body.slice(0, 2000)), status: 'received', provider: input.provider ?? d.provider.name,
      providerMessageId: input.providerMessageId ?? null, fromNumber: from, createdAt: d.now(),
    });
    return stored ? { referralId: null, outcome: 'unknown number (stored)' } : { referralId: null, duplicate: true, outcome: 'duplicate' };
  }
  return withReferralLock(ref.id, () => inboundTurn(d, { ...input, from, body }, ref));
}

async function inboundTurn(d0: SmsDeps, input: InboundInput, ref0: RefCtx): Promise<InboundResult> {
  const q = d0.db;
  const now = d0.now();
  // Re-read inside the lock: the turn that just finished may have changed state or opt-out.
  const ref = await repo.loadRef(q, ref0.id) ?? ref0;
  const msgId = await repo.insertMessage(q, {
    referralId: ref.id, patientId: ref.patientId, direction: 'inbound', author: 'patient',
    body: cleanText(input.body.slice(0, 2000)), status: 'received', provider: input.provider ?? d0.provider.name,
    providerMessageId: input.providerMessageId ?? null, fromNumber: input.from, createdAt: now, errorCode: PROCESSING,
  });
  if (!msgId) return { referralId: ref.id, duplicate: true, outcome: 'duplicate' };

  const trace: TurnTrace = { sends: [], alerts: 0 };
  const d: SmsDeps = { ...d0 };
  traces.set(d, trace);
  let result: InboundResult;
  try {
    result = await processInbound(d, input, ref, msgId, now);
    result = await ensureNotSilent(d, ref, result, trace);
  } catch (err) {
    logError('sms inbound turn', err);
    try {
      await raiseAmber(d, ref, 'agent_error',
        `Relay hit an error (${(err as { name?: string })?.name ?? 'Error'}) while handling a text from the patient. A reply may not have gone out. Please read the thread and reply.`, true);
      result = { referralId: ref.id, outcome: 'amber agent_error (exception)' };
    } catch (err2) {
      // Database unavailable: leave the "processing" marker for the sweeper. Returning (not
      // throwing) means SNS doesn't retry into the de-dupe and drop the text silently.
      logError('sms inbound fallback', err2);
      return { referralId: ref.id, outcome: 'error (left for sweeper)' };
    }
  }
  await q.query(`update messages set error_code = null where id = $1 and error_code = $2`, [msgId, PROCESSING])
    .catch(err => logError('sms inbound mark processed', err));
  const { silentOk: _silentOk, ...out } = result;
  return out;
}

/**
 * The "never silent" net. When a turn on an active thread ends with nothing sent and no
 * red/amber raised (the model returned an empty reply, asked for a template code refused,
 * …) or with a reply the provider failed to send, staff get an amber agent_error.
 */
async function ensureNotSilent(d: SmsDeps, ref: RefCtx, result: InboundResult, trace: TurnTrace): Promise<InboundResult> {
  if (result.silentOk || trace.alerts > 0) return result;
  const failed = trace.sends.includes('failed');
  if (!failed && trace.sends.length > 0) return result;
  await raiseAmber(d, ref, 'agent_error', failed
    ? 'The reply to the patient could not be sent (SMS provider error). Please read the thread and contact the patient.'
    : 'The patient texted but no reply went out (the AI gave no usable reply). Please read the thread and reply.', true);
  return { ...result, outcome: `${result.outcome}; amber agent_error (${failed ? 'send failed' : 'nothing sent'})` };
}

/** Thread paused / texting off / all texting paused: nothing is sent, but staff must learn the patient wrote. */
async function notePausedReply(d: SmsDeps, ref: RefCtx): Promise<void> {
  if ((await repo.listOpenNeedsHuman(d.db, ref.id)).length) {
    const trace = traces.get(d);
    if (trace) trace.alerts++; // staff already have an open item for this patient
    return;
  }
  await raiseAmber(d, ref, 'patient_replied_paused', 'The patient texted while texting was paused for them. Please read the thread.', false, SYSTEM_ACTOR);
}

/**
 * Inbound texts whose turn never finished (process restart, database outage mid-turn):
 * still marked "processing" after UNPROCESSED_AFTER_MS. Raises one amber item each so no
 * patient is dropped silently. Called from the outreach tick; sends nothing.
 */
export async function sweepUnprocessedInbound(d: SmsDeps): Promise<number> {
  const cutoff = new Date(d.now().getTime() - UNPROCESSED_AFTER_MS);
  const { rows } = await d.db.query<{ id: string; referral_id: string }>(
    `select id, referral_id from messages where direction = 'inbound' and error_code = $1 and referral_id is not null
        and created_at < $2 order by created_at limit 100`, [PROCESSING, cutoff]);
  let n = 0;
  for (const m of rows) {
    try {
      const ref = await repo.loadRef(d.db, m.referral_id);
      if (ref) {
        await raiseAmber(d, ref, 'agent_error', 'A text from the patient was not fully processed (server error). A reply may not have gone out. Please read the thread and reply.', true, SYSTEM_ACTOR);
        n++;
      }
      await d.db.query(`update messages set error_code = null where id = $1`, [m.id]);
    } catch (err) {
      logError('sms sweep unprocessed', err);
    }
  }
  return n;
}

async function processInbound(d: SmsDeps, input: InboundInput, ref: RefCtx, msgId: string, now: Date): Promise<InboundResult> {
  const q = d.db;
  const conv = await repo.getConv(q, ref.id);
  const lastActivity = Math.max(conv.lastInboundAt?.getTime() ?? 0, conv.lastOutboundAt?.getTime() ?? 0);
  const isNewConversation = !lastActivity || now.getTime() - lastActivity > 24 * 3600_000;
  await repo.updateConv(q, ref.id, { lastInboundAt: now, repliedSinceOutreach: true });
  await repo.appendSmsTurn(q, ref.id, 'patient', input.body, now);
  await repo.audit(q, SYSTEM_ACTOR, ref.id, 'sms.received', 'Text received from patient');

  // 1. Exact keywords (code, no AI) — R6.2
  const kw = detectKeyword(input.body);
  if (kw) return handleKeyword(d, ref, conv, kw);

  // 2. Emergency backstop — runs for everyone, including opted-out numbers (R1.3)
  const backstop = detectEmergency(input.body);
  const quote = `Patient texted: "${input.body.slice(0, 240)}"`;

  // 3. Opted out / suppressed number: store + pre-screen only, never text (R1.3)
  if (ref.optedOut || conv.numberSuppressed) {
    if (backstop) {
      await raiseRed(d, ref, backstop.code, `${quote} (number opted out / suppressed — no text sent; call the patient)`);
      return { referralId: ref.id, outcome: 'red (no SMS: opted out)' };
    }
    return { referralId: ref.id, outcome: 'stored (opted out / suppressed)', silentOk: true };
  }

  // 4. Already red: only the short supportive line, never scheduling (R1.2.5)
  const lang = langFor(ref, conv);
  if (ref.state === 'Escalated' && conv.pausedReason?.startsWith('red:')) {
    const crisis = conv.pausedReason === 'red:suicide_self_harm' || backstop?.code === 'suicide_self_harm';
    await sendTemplate(d, ref, crisis ? 'red_followup_crisis' : 'red_followup_emergency', lang);
    return { referralId: ref.id, outcome: 'red follow-up' };
  }

  // 5. Kill switch: inbound stored and pre-screened, red still raised, nothing else (§0)
  const settings = await repo.loadOutreachSettings(q);
  if (settings.textingPaused) {
    if (backstop) {
      await raiseRed(d, ref, backstop.code, quote);
      await sendTemplate(d, ref, redTemplateFor(backstop.code), lang);
      return { referralId: ref.id, outcome: 'red (texting paused)' };
    }
    await notePausedReply(d, ref);
    return { referralId: ref.id, outcome: 'stored (all texting paused)' };
  }

  // Per-thread pause (amber) or staff turned SMS off: the AI still screens for safety,
  // but nothing except red / opt-out / wrong-number is acted on.
  const safetyOnly = conv.paused || conv.channelPreference !== 'sms' || conv.exhausted;

  // Identity re-verification window (R4.4)
  if (conv.identityVerified && !identityStillValid(conv, now)) {
    await repo.updateConv(q, ref.id, { identityVerified: false, identityAttempts: 0 });
    conv.identityVerified = false;
    conv.identityAttempts = 0;
  }

  // AI reply loop guard (R7.3: 15 AI messages / patient / day)
  const today = localDate(now, d.tz);
  const aiToday = conv.aiMessagesDay === today ? conv.aiMessagesToday : 0;
  if (!safetyOnly && aiToday >= settings.aiDailyCap) {
    if (backstop) {
      await raiseRed(d, ref, backstop.code, quote);
      await sendTemplate(d, ref, redTemplateFor(backstop.code), lang);
      return { referralId: ref.id, outcome: 'red' };
    }
    await raiseAmber(d, ref, 'off_topic_repeated', 'Daily AI message limit reached for this patient.', true);
    return { referralId: ref.id, outcome: 'amber (AI daily cap)' };
  }

  // Slots are only offered once identity is verified.
  if (conv.identityVerified && conv.offeredSlots.length === 0 && !safetyOnly) {
    conv.offeredSlots = await freshSlots(d, q, conv);
    await repo.updateConv(q, ref.id, { offeredSlots: conv.offeredSlots });
  }

  // 6. Model turn
  const pool = conv.identityVerified && !safetyOnly ? await openSlotPool(d, q, conv) : [];
  const context = await buildTurnContext(d, ref, conv, isNewConversation, aiToday, pool);
  const history = await buildHistory(d, ref.id, msgId);
  let out: SmsTurnOutput | null = null;
  let modelError: string | null = null;
  try {
    const turnInput = { clinicName: d.clinicName, patientFirstName: ref.firstName, history, patientMessage: input.body, context };
    // Bounded in time, and every string cleaned before validation (NUL / lone surrogates break the inserts).
    const ask = async (inp: ModelInput) => validateModelOutput(cleanDeep(
      await withTimeout(Promise.resolve().then(() => d.model.turn(inp)), d.modelTimeoutMs ?? MODEL_TIMEOUT_MS, 'model turn')));
    let v = await ask(turnInput);
    if (!v.ok) {
      // One correction attempt (e.g. reply_text over 300 characters). Every check still applies after.
      v = await ask({ ...turnInput, correction: v.errors.slice(0, 5).join(', ') });
    }
    if (v.ok) out = v.output;
    else modelError = `invalid model output: ${v.errors.slice(0, 5).join(', ')}`;
  } catch (err) {
    logError('sms model turn', err);
    modelError = `model error (${(err as { name?: string })?.name ?? 'Error'})`;
  }

  if (!out) {
    // Fail-safe: nothing AI-written goes out. The emergency template still does if the backstop matched.
    if (backstop) {
      await raiseRed(d, ref, backstop.code, quote);
      await sendTemplate(d, ref, redTemplateFor(backstop.code), lang);
      return { referralId: ref.id, outcome: 'red (model failed)' };
    }
    await raiseAmber(d, ref, 'agent_error', modelError, true);
    return { referralId: ref.id, outcome: 'amber agent_error' };
  }

  return applyTurn(d, ref, conv, out, { backstop, quote, safetyOnly, lang, aiToday, today, body: input.body, pool });
}

async function handleKeyword(
  d: SmsDeps, ref: RefCtx, conv: Conv, kw: NonNullable<ReturnType<typeof detectKeyword>>,
): Promise<InboundResult> {
  const q = d.db;
  const lang = kw.lang ?? langFor(ref, conv);
  if (kw.action === 'opt_out') {
    const already = ref.optedOut;
    await repo.setOptOut(q, ref.patientId, true, `keyword ${kw.keyword}`, d.now());
    await repo.updateConv(q, ref.id, { paused: true, pausedReason: 'opted_out' });
    await repo.audit(q, SYSTEM_ACTOR, ref.id, 'sms.opt_out', `Patient opted out of texts (keyword ${kw.keyword})`);
    if (!already) await sendTemplate(d, ref, 'stop_confirmation', lang, {}, { allowOptedOut: true });
    if (kw.keyword === 'CANCEL' && ref.state === 'Booked') {
      await raiseAmber(d, ref, 'appointment_change', 'Patient replied CANCEL and has a Booked appointment — check whether they meant the appointment.', true, SYSTEM_ACTOR);
    }
    return { referralId: ref.id, outcome: 'opted out', silentOk: already }; // a repeat STOP gets no second confirmation
  }
  if (kw.action === 'help') {
    await sendTemplate(d, ref, 'help_reply', lang, {}, { allowOptedOut: true });
    return { referralId: ref.id, outcome: 'help' };
  }
  // START: record re-consent; outreach resumes only after staff decide (R6.6).
  await repo.setOptOut(q, ref.patientId, false, `keyword ${kw.keyword}`, d.now());
  await repo.audit(q, SYSTEM_ACTOR, ref.id, 'sms.opt_in', `Patient opted back in to texts (keyword ${kw.keyword})`);
  await raiseAmber(d, ref, 'opted_back_in', 'Patient replied START. Decide whether to resume texting.', true, SYSTEM_ACTOR);
  return { referralId: ref.id, outcome: 'opted back in' };
}

async function buildTurnContext(d: SmsDeps, ref: RefCtx, conv: Conv, isNew: boolean, aiToday: number, pool: OfferedSlot[] = []): Promise<TurnContext> {
  const now = d.now();
  const verified = conv.identityVerified;
  const booked = verified ? await repo.confirmedAppointment(d.db, ref.id) : null;
  const p = zonedParts(now, d.tz);
  const offset = (() => {
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const off = Math.round((local - Math.floor(now.getTime() / 60000) * 60000) / 60000);
    const a = Math.abs(off);
    return `${off >= 0 ? '+' : '-'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  })();
  return {
    now_local: `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00${offset}`,
    today_date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: d.tz }),
    is_new_conversation: isNew,
    locked_language: langFor(ref, conv),
    identity_verified: verified,
    identity_attempts: conv.identityAttempts,
    referring_provider: verified ? ref.referringProvider || null : null,
    location_short: verified ? ref.location || null : null,
    offered_slots: verified
      ? conv.offeredSlots.map(s => ({ slot_id: s.slot_id, start: s.start, provider: s.provider, label_en: s.label_en, label_es: s.label_es }))
      : [],
    more_open_slots: verified ? pool.map(s => ({ slot_id: s.slot_id, label_en: s.label_en, label_es: s.label_es })) : [],
    captured_slot_id: conv.capturedSlotId,
    booked_appointment: booked ? { label: `${booked.day} at ${booked.time}` } : null,
    redirects_used: conv.redirectsUsed,
    ai_messages_today: aiToday,
  };
}

async function buildHistory(d: SmsDeps, referralId: string, excludeId: string): Promise<HistoryTurn[]> {
  const rows = await repo.listMessages(d.db, referralId, { sinceDays: HISTORY_DAYS, now: d.now() });
  return rows
    .filter(m => m.id !== excludeId && !['suppressed', 'failed'].includes(m.status))
    .map((m): HistoryTurn => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', text: m.body }))
    .slice(-HISTORY_MAX_TURNS);
}

interface TurnState {
  backstop: { code: RedCode } | null;
  quote: string;
  safetyOnly: boolean;
  lang: Lang;
  aiToday: number;
  today: string;
  body: string;
  /** more_open_slots shown to the model this turn (may be captured or named in a reply). */
  pool: OfferedSlot[];
}

async function applyTurn(d: SmsDeps, ref: RefCtx, conv: Conv, out: SmsTurnOutput, st: TurnState): Promise<InboundResult> {
  const q = d.db;
  const decision = resolveDecision(out, {
    backstop: st.backstop, identityVerified: conv.identityVerified, offeredSlotIds: [...conv.offeredSlots, ...st.pool].map(s => s.slot_id),
  });
  const summary = out.escalation.staff_summary ?? null;

  // Language lock / explicit switch (R8)
  let lang = st.lang;
  if (out.language_switch_request && out.language_switch_request !== lang) {
    lang = out.language_switch_request;
    await repo.updateConv(q, ref.id, { lockedLanguage: lang });
    await repo.audit(q, AI_ACTOR, ref.id, 'sms.language', `Texting language switched to ${lang === 'es' ? 'Spanish' : 'English'} at patient's request`);
  } else if (!conv.lockedLanguage) {
    await repo.updateConv(q, ref.id, { lockedLanguage: lang });
  }

  // Bookkeeping that never sends anything
  const patch: Partial<Conv> = {};
  if (out.preferences) patch.preferences = out.preferences;
  if (out.friction.length) patch.friction = [...new Set([...conv.friction, ...out.friction])];
  if (out.intent === 'prompt_injection' || out.intent === 'off_topic') patch.redirectsUsed = conv.redirectsUsed + 1;
  if (Object.keys(patch).length) await repo.updateConv(q, ref.id, patch);

  switch (decision.kind) {
    case 'red':
      await raiseRed(d, ref, decision.code, summary ? `${summary} — ${st.quote}` : st.quote);
      await sendTemplate(d, ref, decision.template, lang);
      return { referralId: ref.id, outcome: `red ${decision.code}` };

    case 'opt_out':
      await repo.setOptOut(q, ref.patientId, true, 'natural-language opt-out', d.now());
      await repo.updateConv(q, ref.id, { paused: true, pausedReason: 'opted_out' });
      await repo.audit(q, AI_ACTOR, ref.id, 'sms.opt_out', 'Patient opted out of texts (plain-language request)');
      if (out.escalation.tier === 'amber' && out.escalation.reason_code) {
        await raiseAmber(d, ref, out.escalation.reason_code, summary, true);
      }
      await sendTemplate(d, ref, 'stop_confirmation', lang, {}, { allowOptedOut: true });
      return { referralId: ref.id, outcome: 'opted out' };

    case 'wrong_number':
      await repo.updateConv(q, ref.id, { numberSuppressed: true });
      await raiseAmber(d, ref, 'wrong_number', summary ?? 'Person says this is a wrong number. Fix the phone number in eCW.', true);
      await repo.setSmsAttemptOutcome(q, ref.id, 'Wrong Number');
      await sendTemplate(d, ref, 'wrong_number', lang, {}, { allowSuppressed: true });
      return { referralId: ref.id, outcome: 'wrong number' };
  }

  if (st.safetyOnly) {
    // Paused thread: record new amber reasons for staff, send nothing.
    if (out.escalation.tier === 'amber' && out.escalation.reason_code) {
      await raiseAmber(d, ref, out.escalation.reason_code, summary, out.escalation.pause_automation);
    } else {
      await notePausedReply(d, ref);
    }
    return { referralId: ref.id, outcome: 'stored (thread paused)' };
  }

  // Identity check by code (R4.2) — when the patient's text or the model holds a DOB and no handoff applies.
  // Code's parse of the patient's own words wins; the model's extraction is the fallback (one guess per text).
  const handoff = decision.kind === 'amber' && decision.pause;
  const dobCandidate = conv.identityVerified ? null : pickDobCandidate(st.body, out.identity.dob_candidate, d.now());
  if (dobCandidate && !handoff) {
    return identityStep(d, ref, conv, dobCandidate, lang);
  }

  switch (decision.kind) {
    case 'agent_error':
      await raiseAmber(d, ref, 'agent_error', decision.reason, true);
      return { referralId: ref.id, outcome: 'amber agent_error' };

    case 'amber': {
      await raiseAmber(d, ref, decision.code, summary, decision.pause);
      if (out.call_outcome) await repo.setSmsAttemptOutcome(q, ref.id, out.call_outcome);
      else if (decision.pause) await repo.setSmsAttemptOutcome(q, ref.id, 'Transferred to Staff');
      if (decision.alsoCapture) return captureStep(d, ref, conv, decision.alsoCapture, lang, st.pool);
      if (decision.code === 'language_barrier') {
        await sendTemplate(d, ref, 'language_barrier', lang);
      } else if (decision.template) {
        await sendModelTemplate(d, ref, conv, decision.template, lang);
      } else if (decision.replyText) {
        await sendAiReply(d, ref, conv, decision.replyText, st);
      }
      return { referralId: ref.id, outcome: `amber ${decision.code}` };
    }

    case 'captured':
      return captureStep(d, ref, conv, decision.slotId, lang, st.pool);

    case 'reply':
      if (decision.template) await sendModelTemplate(d, ref, conv, decision.template, lang);
      else if (decision.replyText) await sendAiReply(d, ref, conv, decision.replyText, st);
      if (out.call_outcome && ['Interested', 'Call Back Requested', 'Declined Referral'].includes(out.call_outcome)) {
        await repo.setSmsAttemptOutcome(q, ref.id, out.call_outcome);
      }
      // "ok thanks" once a time is picked / booked needs no answer. Any other empty turn is caught by ensureNotSilent.
      return {
        referralId: ref.id, outcome: 'reply',
        silentOk: out.intent === 'acknowledgement' && (!!conv.capturedSlotId || ref.state === 'Pending Confirmation' || ref.state === 'Booked'),
      };
  }
  return { referralId: ref.id, outcome: 'none' };
}

async function sendModelTemplate(d: SmsDeps, ref: RefCtx, conv: Conv, template: string, lang: Lang) {
  if (template === 'slot_offer') {
    if (!conv.identityVerified || conv.offeredSlots.length < 2) {
      if (conv.identityVerified) await raiseAmber(d, ref, 'no_slot_works', 'No open times left to offer by text.', true);
      return;
    }
    await sendTemplate(d, ref, 'slot_offer', lang, slotVars(conv.offeredSlots, lang));
    return;
  }
  if (template === 'slot_captured') return; // only via a validated captured slot
  await sendTemplate(d, ref, template as TemplateId, lang);
}

async function sendAiReply(d: SmsDeps, ref: RefCtx, conv: Conv, text: string, st: TurnState) {
  const problems = validateOutgoing(text, {
    clinicPhone: d.clinicPhone, dobIso: ref.dobIso, sensitiveText: `${ref.reason} ${ref.specialty} ${d.specialty}`,
    offeredSlots: [...conv.offeredSlots, ...st.pool], identityVerified: conv.identityVerified,
  });
  if (problems.length) {
    if (!conv.identityVerified) {
      // Before identity is verified the only job is to get a date of birth. Blocking the AI's reply
      // (it often echoes a typed date back) must not pause the thread: send the fixed DOB request instead.
      await repo.audit(d.db, AI_ACTOR, ref.id, 'sms.guard_blocked', `AI reply blocked (${problems.join(', ')}); sent the date-of-birth request instead`);
      await sendTemplate(d, ref, 'identity_ask', st.lang);
      return;
    }
    await raiseAmber(d, ref, 'agent_error', `AI reply blocked by the outbound guard: ${problems.join(', ')}.`, true);
    return;
  }
  const status = await sendSms(d, ref, { body: text, author: 'ai' });
  if (status !== 'suppressed') {
    await repo.updateConv(d.db, ref.id, { aiMessagesDay: st.today, aiMessagesToday: st.aiToday + 1 });
  }
}

async function identityStep(d: SmsDeps, ref: RefCtx, conv: Conv, candidate: string, lang: Lang): Promise<InboundResult> {
  const q = d.db;
  if (!ref.dobIso) {
    await raiseAmber(d, ref, 'identity_failed', 'No date of birth on file — identity cannot be checked by text.', true);
    await sendTemplate(d, ref, 'identity_not_verified', lang);
    return { referralId: ref.id, outcome: 'amber identity_failed (no DOB on file)' };
  }
  if (dobMatches(candidate, ref.dobIso, d.now())) {
    const slots = await freshSlots(d, q, conv);
    await repo.updateConv(q, ref.id, {
      identityVerified: true, identityVerifiedAt: d.now(), identityAttempts: 0, offeredSlots: slots,
    });
    await repo.setSmsAttemptOutcome(q, ref.id, 'Identity Verified');
    await repo.audit(q, AI_ACTOR, ref.id, 'sms.identity', 'Identity verified by date of birth (SMS)');
    if (slots.length < 2) {
      await raiseAmber(d, ref, 'no_slot_works', 'Identity verified but no open times to offer by text.', true);
      return { referralId: ref.id, outcome: 'verified, no slots' };
    }
    await sendTemplate(d, ref, 'slot_offer', lang, slotVars(slots, lang));
    return { referralId: ref.id, outcome: 'identity verified' };
  }
  const attempts = conv.identityAttempts + 1;
  await repo.updateConv(q, ref.id, { identityAttempts: attempts });
  await repo.audit(q, AI_ACTOR, ref.id, 'sms.identity', `Date of birth did not match (attempt ${attempts} of 2)`);
  if (attempts >= 2) {
    await raiseAmber(d, ref, 'identity_failed', 'Date of birth did not match twice.', true);
    await sendTemplate(d, ref, 'identity_not_verified', lang);
    return { referralId: ref.id, outcome: 'amber identity_failed' };
  }
  await sendTemplate(d, ref, 'identity_retry', lang);
  return { referralId: ref.id, outcome: 'identity retry' };
}

async function captureStep(d: SmsDeps, ref: RefCtx, conv: Conv, slotId: string, lang: Lang, pool: OfferedSlot[] = []): Promise<InboundResult> {
  const q = d.db;
  const offered = conv.offeredSlots.find(s => s.slot_id === slotId);
  const slot = offered ?? pool.find(s => s.slot_id === slotId)!;
  if (!offered) {
    // Picked from the wider pool the AI suggested: keep it with the offered slots (labels, rebooking).
    conv.offeredSlots = [...conv.offeredSlots, slot];
    await repo.updateConv(q, ref.id, { offeredSlots: conv.offeredSlots });
  }
  if (ref.state === 'Booked') {
    await raiseAmber(d, ref, 'appointment_change', 'Patient with a Booked appointment picked a new time by text.', true);
    await sendTemplate(d, ref, 'human_handoff', lang);
    return { referralId: ref.id, outcome: 'amber appointment_change' };
  }
  // A slot taken by someone else since it was offered must not be double-captured.
  if (takenSlotKeys(await repo.takenSlots(q)).has(slotKey(slot.day, slot.time)) && conv.capturedSlotId !== slotId) {
    const slots = await freshSlots(d, q, conv);
    await repo.updateConv(q, ref.id, { offeredSlots: slots });
    if (slots.length >= 2) await sendTemplate(d, ref, 'slot_offer', lang, slotVars(slots, lang));
    else await raiseAmber(d, ref, 'no_slot_works', 'The picked time was taken and no other open times are left to offer by text.', true);
    return { referralId: ref.id, outcome: 'slot no longer free; re-offered' };
  }
  await repo.captureSlot(q, ref.id, slot, d.now());
  await repo.setReferralState(q, ref.id, 'Pending Confirmation', d.now());
  await repo.updateConv(q, ref.id, { capturedSlotId: slotId });
  await repo.setSmsAttemptOutcome(q, ref.id, 'Appointment Accepted', `Patient picked ${slot.label_en} by text. Not booked until the MA confirms.`, slot.day);
  await repo.audit(q, AI_ACTOR, ref.id, 'slot.capture', `Captured slot ${slot.day} ${slot.time} by SMS — sent to confirm queue`);
  await sendTemplate(d, ref, 'slot_captured', lang, { slot_label: slotLabel(slot, lang) });
  return { referralId: ref.id, outcome: 'slot captured' };
}

// ── Staff actions + MA hooks ────────────────────────────────────────────────

export class SmsActionError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'SmsActionError'; }
}

export async function staffSend(d: SmsDeps, referralId: string, body: string, actor: AuditActor): Promise<SendStatus> {
  const text = body.trim();
  if (!text) throw new SmsActionError(400, 'Message is empty.');
  if (text.length > STAFF_MAX_CHARS) throw new SmsActionError(400, `Keep texts under ${STAFF_MAX_CHARS} characters.`);
  const ref = await repo.loadRef(d.db, referralId);
  if (!ref) throw new SmsActionError(404, 'Referral not found.');
  if (ref.optedOut) throw new SmsActionError(409, 'This patient opted out of texts. Call them instead.');
  const conv = await repo.getConv(d.db, referralId);
  if (conv.numberSuppressed) throw new SmsActionError(409, 'This number was reported as a wrong number.');
  if ((await repo.loadOutreachSettings(d.db)).textingPaused) throw new SmsActionError(409, 'All texting is paused in Settings.');
  return sendSms(d, ref, { body: text, author: 'staff', actor, sentBy: actor.name });
}

/** After the MA confirms (Booked): booked_confirmation to a number verified for this referral (R4.4, R9.2). */
export async function afterSlotConfirmed(d: SmsDeps, referralId: string): Promise<SendStatus | null> {
  const ref = await repo.loadRef(d.db, referralId);
  const conv = ref && await repo.findConv(d.db, referralId);
  if (!ref || !conv || !conv.identityVerifiedAt || conv.pausedReason?.startsWith('red:')) return null;
  const appt = await repo.confirmedAppointment(d.db, referralId);
  if (!appt) return null;
  const lang = langFor(ref, conv);
  const offered = conv.offeredSlots.find(s => s.day === appt.day && s.time === appt.time);
  const label = offered ? slotLabel(offered, lang) : `${appt.day.replace(/^(\w{3}) /, '$1, ')} at ${appt.time}`;
  await repo.updateConv(d.db, referralId, { capturedSlotId: null });
  return sendTemplate(d, ref, 'booked_confirmation', lang, { appointment_date_time: label });
}

/** After the MA rejects a captured slot: re-offer new times automatically (if still verified). */
export async function afterSlotRejected(d: SmsDeps, referralId: string, rejected: { day: string; time: string } | null): Promise<SendStatus | null> {
  const ref = await repo.loadRef(d.db, referralId);
  const conv = ref && await repo.findConv(d.db, referralId);
  if (!ref || !conv) return null;
  const rejectedKeys = rejected ? [...new Set([...conv.rejectedSlotKeys, slotKey(rejected.day, rejected.time)])] : conv.rejectedSlotKeys;
  conv.rejectedSlotKeys = rejectedKeys;
  await repo.updateConv(d.db, referralId, { rejectedSlotKeys: rejectedKeys, capturedSlotId: null });
  if (!identityStillValid(conv, d.now()) || conv.paused || conv.channelPreference !== 'sms') return null;
  const slots = await freshSlots(d, d.db, conv);
  await repo.updateConv(d.db, referralId, { offeredSlots: slots });
  await repo.audit(d.db, SYSTEM_ACTOR, referralId, 'sms.reoffer', 'Captured slot rejected by MA — new times offered by text');
  if (slots.length < 2) {
    await raiseAmber(d, ref, 'no_slot_works', 'Slot rejected and no other open times to offer by text.', true, SYSTEM_ACTOR);
    return null;
  }
  return sendTemplate(d, ref, 'slot_offer', langFor(ref, conv), slotVars(slots, langFor(ref, conv)));
}

// ── Re-entry into outreach after an eCW cancellation / no-show (CSV import) ──

/**
 * Resets the per-referral texting cycle so outreach starts over: identity must be
 * checked again (R4.4), old offers and the captured slot are void, the 0/2/5/9
 * cadence restarts. The lifetime cap (outreach_count) is NOT reset (R7.3).
 * Runs inside the import transaction; sends nothing.
 */
export async function resetOutreachForReentry(q: Queryable, referralId: string): Promise<void> {
  await repo.getConv(q, referralId);
  await repo.updateConv(q, referralId, {
    cycleStep: 0, cycleStartedAt: null, repliedSinceOutreach: false, exhausted: false,
    identityVerified: false, identityAttempts: 0, offeredSlots: [], capturedSlotId: null,
  });
}

/**
 * A Booked appointment was cancelled in eCW and the referral is back In Progress:
 * send `cancellation_reoffer` (SMS_TEMPLATES #9) as the first text of a new cycle.
 * It counts toward the lifetime cap and is held for quiet hours like any outreach
 * text. When texting is not possible the outreach tick takes over with the reset
 * cycle (minors and unsupported languages raise their own amber items there);
 * when the lifetime cap is already used up, staff get an amber item to call.
 */
export async function afterAppointmentCancelled(d: SmsDeps, referralId: string): Promise<SendStatus | 'amber' | null> {
  const q = d.db;
  const ref = await repo.loadRef(q, referralId);
  if (!ref || ref.state !== 'In Progress') return null;
  const conv = await repo.getConv(q, referralId);
  const settings = await repo.loadOutreachSettings(q);
  if (conv.outreachCount >= settings.lifetimeCap) {
    await raiseAmber(d, ref, 'ecw_cancelled', 'Appointment cancelled in eCW. Texting limit already reached — please call the patient.', true, SYSTEM_ACTOR);
    return 'amber';
  }
  const lang = repo.langFromPatient(ref.language);
  const minor = !!ref.dobIso && ageOn(ref.dobIso, d.now(), d.tz) < 18;
  if (conv.paused || conv.numberSuppressed || conv.channelPreference !== 'sms' || ref.optedOut
    || !ref.phone || settings.textingPaused || !lang || minor) {
    return null;
  }
  const now = d.now();
  await repo.openSmsAttempt(q, referralId, now, 'Text sent: cancellation reoffer');
  const status = await sendTemplate(d, ref, 'cancellation_reoffer', conv.lockedLanguage ?? lang, {}, { actor: AI_ACTOR });
  if (status === 'suppressed' || status === 'failed') return status;
  await repo.updateConv(q, referralId, {
    cycleStep: 1, cycleStartedAt: now, lastOutreachAt: now, outreachCount: conv.outreachCount + 1,
    repliedSinceOutreach: false, lockedLanguage: conv.lockedLanguage ?? lang,
  });
  return status;
}

