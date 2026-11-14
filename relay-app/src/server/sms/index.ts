// SMS feature entry point for route handlers: wires the real dependencies and
// shapes data for the browser (src/lib/types.ts). Route handlers import only this file.

import 'server-only';
import { getDb } from '@/server/db';
import { getOrg, getRawSettings } from '@/server/staticData';
import type {
  ConfirmQueueItem, NeedsHumanItem, OutreachSettings, OutreachSettingsView, SmsChannelPreference, SmsMessage, SmsThread,
} from '@/lib/types';
import type { SessionUser } from '@/lib/auth-types';
import {
  afterSlotConfirmed, afterSlotRejected, handleInbound, SmsActionError, staffSend, type SmsDeps,
} from './engine';
import { aiProviderName, getSmsAgentModel } from './model';
import { runOutreachTick } from './outreach';
import { getSmsProvider, smsProviderName } from './provider';
import * as repo from './repo';
import { staffActor } from './repo';
import { clinicTimeZone, DEFAULT_OUTREACH_SETTINGS } from './schedule';
import { OUTREACH_STEPS } from './templates';

export { SmsActionError };

export function clinicDisplayName(): string {
  return process.env.CLINIC_DISPLAY_NAME || 'Community Health Clinic';
}
export function clinicPhoneNumber(): string {
  return process.env.CLINIC_PHONE_NUMBER || '(555) 555-0123';
}

export async function smsDeps(): Promise<SmsDeps> {
  const raw = getRawSettings();
  return {
    db: await getDb(),
    provider: getSmsProvider(),
    model: getSmsAgentModel(),
    now: () => new Date(),
    tz: clinicTimeZone(),
    clinicName: clinicDisplayName(),
    clinicPhone: clinicPhoneNumber(),
    providers: raw.practiceProfile.providers,
    specialty: getOrg().specialty,
  };
}

const fmt = (v: Date | null | undefined): string | null =>
  v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: clinicTimeZone() }) : null;

export const REASON_LABELS: Record<string, string> = {
  human_requested: 'Asked for a person', complaint: 'Complaint / upset', confusion: 'Confused',
  clinical_question: 'Clinical question', cost_insurance_question: 'Cost / insurance question',
  distress_non_emergency: 'Distressed (no emergency)', identity_failed: 'Identity not verified',
  wrong_number: 'Wrong number', proxy_or_caregiver: 'Family member / caregiver replied', minor: 'Minor',
  language_barrier: 'Language barrier', declined: 'Declined referral', transport_assistance: 'Needs ride help',
  no_slot_works: 'No offered time works', appointment_change: 'Wants to change appointment',
  off_topic_repeated: 'Off-topic / abusive', agent_error: 'AI error — nothing sent',
  cadence_exhausted: 'No reply after final text', urgent_referral: 'Urgent referral — call today',
  opted_back_in: 'Opted back in (START)',
  ecw_no_show: 'No show in eCW — call first', ecw_rescheduled: 'Rescheduled in eCW — check new time',
  ecw_cancelled: 'Cancelled in eCW — call patient',
};

function toItem(r: repo.NeedsHumanRow & { patient: string }): NeedsHumanItem {
  return {
    id: r.id, referralId: r.referral_id, patient: r.patient, reasonCode: r.reason_code,
    reasonLabel: REASON_LABELS[r.reason_code] ?? r.reason_code.replaceAll('_', ' '),
    summary: r.summary, pauseAutomation: r.pause_automation, raisedAt: fmt(r.created_at) ?? '',
  };
}

function toMessage(m: repo.MessageRow & { error_code?: string | null }): SmsMessage {
  return {
    id: m.id, direction: m.direction, author: m.author, body: m.body, templateKey: m.template_key,
    status: m.status as SmsMessage['status'], at: fmt(m.created_at) ?? '', sendAfter: fmt(m.send_after),
    segments: m.segments, sentBy: m.sent_by, note: m.error_code ?? null,
  };
}

export async function getSmsThread(referralId: string): Promise<SmsThread | null> {
  const db = await getDb();
  const ref = await repo.loadRef(db, referralId);
  if (!ref) return null;
  const [conv, messages, items, settings] = await Promise.all([
    repo.findConv(db, referralId), repo.listMessages(db, referralId, { limit: 200 }),
    repo.listOpenNeedsHuman(db, referralId), repo.loadOutreachSettings(db),
  ]);
  const step = conv?.cycleStep ?? 0;
  const lang = conv?.lockedLanguage ?? repo.langFromPatient(ref.language);
  return {
    referralId,
    messages: messages.map(toMessage),
    conversation: {
      language: lang,
      identityVerified: conv?.identityVerified ?? false,
      identityAttempts: conv?.identityAttempts ?? 0,
      paused: conv?.paused ?? false,
      pausedReason: conv?.pausedReason ?? null,
      channelPreference: conv?.channelPreference ?? 'sms',
      numberSuppressed: conv?.numberSuppressed ?? false,
      outreachCount: conv?.outreachCount ?? 0,
      lifetimeCap: settings.lifetimeCap,
      nextStep: conv?.repliedSinceOutreach || conv?.exhausted || step >= OUTREACH_STEPS.length ? null : OUTREACH_STEPS[step],
      exhausted: conv?.exhausted ?? false,
      offeredSlots: (conv?.offeredSlots ?? []).map(s => (lang === 'es' ? s.label_es : s.label_en)),
    },
    consent: {
      consent: ref.consent, consentAt: fmt(ref.consentAt), consentSource: ref.consentSource,
      optedOut: ref.optedOut, optedOutAt: fmt(ref.optedOutAt), optOutSource: ref.optOutSource,
    },
    needsHuman: items.map(toItem),
    textingPaused: settings.textingPaused,
    simulatorEnabled: smsProviderName() === 'mock',
    provider: smsProviderName(),
    aiProvider: aiProviderName(),
  };
}

export async function sendStaffText(referralId: string, body: string, user: SessionUser) {
  return staffSend(await smsDeps(), referralId, body, staffActor(user));
}

export async function updateSmsPreferences(
  referralId: string,
  patch: { paused?: boolean; channelPreference?: SmsChannelPreference; consent?: boolean; consentSource?: string },
  user: SessionUser,
): Promise<boolean> {
  const db = await getDb();
  const ref = await repo.loadRef(db, referralId);
  if (!ref) return false;
  const actor = staffActor(user);
  const conv = await repo.getConv(db, referralId);
  if (patch.paused !== undefined && patch.paused !== conv.paused) {
    if (!patch.paused && conv.pausedReason?.startsWith('red:') && ref.state === 'Escalated') {
      throw new SmsActionError(409, 'Resolve the escalation (change the referral state) before resuming texts.');
    }
    await repo.updateConv(db, referralId, { paused: patch.paused, pausedReason: patch.paused ? 'staff' : null });
    await repo.audit(db, actor, referralId, 'sms.pause', patch.paused ? 'Texting paused for this referral' : 'Texting resumed for this referral');
  }
  if (patch.channelPreference && patch.channelPreference !== conv.channelPreference) {
    await repo.updateConv(db, referralId, { channelPreference: patch.channelPreference });
    await repo.audit(db, actor, referralId, 'sms.channel', `Outreach channel preference set to ${patch.channelPreference}`);
  }
  if (patch.consent !== undefined) {
    const source = (patch.consentSource?.trim() || (patch.consent ? 'recorded by staff' : 'withdrawn per staff')).slice(0, 120);
    await repo.setConsent(db, ref.patientId, patch.consent, `${source} (${user.name})`, new Date());
    await repo.audit(db, actor, referralId, 'sms.consent', patch.consent ? `SMS consent recorded (${source})` : `SMS consent removed (${source})`);
  }
  return true;
}

/** Patient simulator (SMS_PROVIDER=mock only): the text arrives exactly like a real inbound SMS. */
export async function simulatePatientText(referralId: string, body: string, user: SessionUser) {
  if (smsProviderName() !== 'mock') throw new SmsActionError(404, 'The patient simulator is only available with SMS_PROVIDER=mock.');
  const text = body.trim().slice(0, 1000);
  if (!text) throw new SmsActionError(400, 'Message is empty.');
  const d = await smsDeps();
  const ref = await repo.loadRef(d.db, referralId);
  if (!ref) throw new SmsActionError(404, 'Referral not found.');
  await repo.audit(d.db, staffActor(user), referralId, 'sms.simulate', 'Patient simulator (prototype) used to send a fake patient text');
  return handleInbound(d, { from: ref.phone, body: text, referralId, provider: 'mock' });
}

export async function receiveInboundSms(input: { from: string; body: string; providerMessageId?: string | null; provider?: 'aws' | 'twilio' }) {
  return handleInbound(await smsDeps(), { ...input, provider: input.provider ?? 'aws' });
}

export async function listNeedsHuman(): Promise<NeedsHumanItem[]> {
  return (await repo.listOpenNeedsHuman(await getDb())).map(toItem);
}

export async function resolveNeedsHumanItem(itemId: string, user: SessionUser): Promise<boolean> {
  const db = await getDb();
  const referralId = await repo.resolveNeedsHuman(db, itemId, user.name, new Date());
  if (!referralId) return false;
  await repo.audit(db, staffActor(user), referralId, 'sms.needs_human.resolve', 'Needs-a-human item resolved');
  return true;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getOutreachSettingsView(): Promise<OutreachSettingsView> {
  const s = await repo.loadOutreachSettings(await getDb());
  const { updatedAt, updatedBy, ...settings } = s;
  return {
    settings, provider: smsProviderName(), aiProvider: aiProviderName(), timezone: clinicTimeZone(),
    devTools: process.env.NODE_ENV !== 'production', updatedAt: fmt(updatedAt), updatedBy,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const intIn = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);

export function sanitizeOutreachSettings(raw: unknown): OutreachSettings {
  const r = (raw ?? {}) as Partial<Record<keyof OutreachSettings, unknown>>;
  const d = DEFAULT_OUTREACH_SETTINGS;
  const days = Array.isArray(r.allowedDays) ? [...new Set(r.allowedDays.filter(x => Number.isInteger(x) && x >= 0 && x <= 6) as number[])].sort() : d.allowedDays;
  const cadence = Array.isArray(r.cadenceDays) ? (r.cadenceDays.filter(x => Number.isInteger(x) && x >= 0 && x <= 60) as number[]) : d.cadenceDays;
  const validCadence = cadence.length >= 1 && cadence.length <= 6 && cadence[0] === 0 && cadence.every((x, i) => i === 0 || x > cadence[i - 1]);
  let quietStart = typeof r.quietStart === 'string' && HHMM.test(r.quietStart) ? r.quietStart : d.quietStart;
  let quietEnd = typeof r.quietEnd === 'string' && HHMM.test(r.quietEnd) ? r.quietEnd : d.quietEnd;
  // R7.1 hard limits: never before 8:00 am or after 8:00 pm, whatever is typed.
  if (quietStart < '08:00') quietStart = '08:00';
  if (quietEnd > '20:00') quietEnd = '20:00';
  if (quietEnd <= quietStart) { quietStart = d.quietStart; quietEnd = d.quietEnd; }
  return {
    textingPaused: typeof r.textingPaused === 'boolean' ? r.textingPaused : false,
    quietStart, quietEnd,
    allowedDays: days.filter(x => x !== 0).length ? days.filter(x => x !== 0) : d.allowedDays, // never Sundays (R7.1)
    holidays: Array.isArray(r.holidays) ? (r.holidays.filter(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) as string[]) : [],
    cadenceDays: validCadence ? cadence : d.cadenceDays,
    lifetimeCap: intIn(r.lifetimeCap, 1, 6, d.lifetimeCap),              // [6] on the consent form is the ceiling
    minSpacingHours: intIn(r.minSpacingHours, 24, 168, d.minSpacingHours),
    exhaustedAfterHours: intIn(r.exhaustedAfterHours, 24, 336, d.exhaustedAfterHours),
    aiDailyCap: intIn(r.aiDailyCap, 1, 15, d.aiDailyCap),
  };
}

export async function saveOutreachSettings(raw: unknown, user: SessionUser): Promise<OutreachSettingsView> {
  const db = await getDb();
  const before = await repo.loadOutreachSettings(db);
  const s = sanitizeOutreachSettings(raw);
  await repo.saveOutreachSettings(db, s, user.name);
  if (before.textingPaused !== s.textingPaused) {
    await repo.audit(db, staffActor(user), null, 'sms.kill_switch', s.textingPaused ? 'PAUSED all texting (kill switch)' : 'Resumed texting (kill switch off)');
  }
  await repo.audit(db, staffActor(user), null, 'sms.settings', 'SMS outreach settings updated');
  return getOutreachSettingsView();
}

export async function runOutreachNow(now?: Date) {
  const d = await smsDeps();
  if (now) d.now = () => now;
  return runOutreachTick(d);
}

// ── MA confirm queue hooks ──────────────────────────────────────────────────

/** Never lets an SMS problem break the MA's confirm/reject action. */
export async function smsAfterConfirm(referralId: string): Promise<void> {
  try { await afterSlotConfirmed(await smsDeps(), referralId); } catch (err) {
    const { logError } = await import('@/server/log');
    logError('sms after confirm', err);
  }
}

export async function smsAfterReject(referralId: string, rejected: { day: string; time: string } | null): Promise<void> {
  try { await afterSlotRejected(await smsDeps(), referralId, rejected); } catch (err) {
    const { logError } = await import('@/server/log');
    logError('sms after reject', err);
  }
}

/** SNS de-dupe: true the first time a MessageId is seen. */
export async function claimSnsMessage(messageId: string): Promise<boolean> {
  return repo.claimInboundEvent(await getDb(), messageId);
}

/** Un-claims a MessageId whose processing failed, so SNS's retry is processed. */
export async function releaseSnsMessage(messageId: string): Promise<void> {
  await (await getDb()).query('delete from sms_inbound_events where sns_message_id = $1', [messageId]);
}

export async function capturedSlotOf(referralId: string): Promise<{ day: string; time: string } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ day: string; time: string }>(
    `select day, time from appointments where referral_id = $1 and status = 'captured' order by captured_at desc limit 1`, [referralId]);
  return rows[0] ?? null;
}

/** Adds the SMS channel + thread excerpt to confirm-queue cards whose latest attempt was a text. */
export async function withSmsExcerpts(items: ConfirmQueueItem[]): Promise<ConfirmQueueItem[]> {
  const db = await getDb();
  const channels = await repo.latestAttemptChannels(db, items.map(i => i.referralId));
  return Promise.all(items.map(async item => {
    const channel = channels.get(item.referralId) === 'sms' ? 'sms' as const : 'voice' as const;
    if (channel !== 'sms') return { ...item, channel };
    const msgs = (await repo.listMessages(db, item.referralId, { limit: 6 })).filter(m => m.status !== 'suppressed');
    return { ...item, channel, smsExcerpt: msgs.map(toMessage) };
  }));
}
