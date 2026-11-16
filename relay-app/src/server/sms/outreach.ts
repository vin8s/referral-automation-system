// Outreach scheduler: sends due unsolicited texts (first_outreach → follow_up_1 →
// follow_up_2 → final_attempt) and releases texts held for quiet hours.
//
// Runs automatically (src/server/sms/autorun.ts: after each referral import, after staff
// approve referrals, and on a timer) and from AWS EventBridge Scheduler calling
// POST /api/sms/outreach/tick in production.
//
// Pilot mode (settings.approvalRequired): a referral's first text waits until staff
// approve it on the dashboard ("Ready to text").
//
// Rules (AGENT_SAFETY_RULES R6, R7): pause switch, quiet hours, cadence 0/2/5/9,
// 48h spacing, 1 per day, lifetime cap 6, consent + opt-out, never text minors,
// English/Spanish only, amber cadence_exhausted 72h after the final attempt.

import { isAllowedNumber } from './allowlist';
import 'server-only';
import { logError } from '@/server/log';
import { flushHeld, sendTemplate, sweepUnprocessedInbound, type SmsDeps } from './engine';
import * as repo from './repo';
import { AI_ACTOR, SYSTEM_ACTOR } from './repo';
import { ageOn, cadenceVerdict, isWithinSendWindow } from './schedule';
import { OUTREACH_STEPS } from './templates';

export interface TickResult {
  paused: boolean;
  inWindow: boolean;
  sent: number;
  heldReleased: number;
  amber: number;
  skipped: Record<string, number>;
}

const MAX_SENDS_PER_TICK = 100;

export async function runOutreachTick(d: SmsDeps): Promise<TickResult> {
  const q = d.db;
  const now = d.now();
  const settings = await repo.loadOutreachSettings(q);
  const result: TickResult = { paused: settings.textingPaused, inWindow: false, sent: 0, heldReleased: 0, amber: 0, skipped: {} };
  const skip = (why: string) => { result.skipped[why] = (result.skipped[why] ?? 0) + 1; };

  // Inbound texts whose turn never finished → amber items (sends nothing, so it runs even when paused).
  result.amber += await sweepUnprocessedInbound(d).catch(err => { logError('sms sweep', err); return 0; });

  // Kill switch: nothing goes out, not even held replies.
  if (settings.textingPaused) return result;

  result.inWindow = isWithinSendWindow(now, settings, d.tz);
  result.heldReleased = await flushHeld(d, settings);

  const amber = async (ref: repo.RefCtx, code: string, summary: string) => {
    if (await repo.addNeedsHuman(q, ref.id, code, summary, true, now)) {
      result.amber++;
      await repo.audit(q, SYSTEM_ACTOR, ref.id, 'sms.needs_human', `Needs a human (${code.replaceAll('_', ' ')}) · texting paused`);
    }
    await repo.updateConv(q, ref.id, { paused: true, pausedReason: `amber:${code}` });
  };

  let providerFailed = false;
  for (const ref of await repo.listOutreachCandidates(q)) {
    if (result.sent >= MAX_SENDS_PER_TICK) { skip('tick limit'); continue; }
    if (providerFailed) { skip('provider failure earlier this tick'); continue; }
    // One referral that throws (bad row, DB blip) used to abort the whole tick — and, being
    // first in the same order every time, block every referral behind it on every tick.
    try {
      const r = await outreachOne(ref);
      if (r === 'failed') providerFailed = true;
    } catch (err) {
      logError('outreach referral', err);
      skip('error');
    }
  }
  return result;

  async function outreachOne(ref: repo.RefCtx): Promise<'failed' | void> {
    const conv = await repo.findConv(q, ref.id);
    if (conv?.paused) { skip('thread paused'); return; }
    if (conv?.exhausted) { skip('cadence exhausted'); return; }
    if (conv?.numberSuppressed) { skip('wrong number'); return; }
    if (conv && conv.channelPreference !== 'sms') { skip('SMS off for referral'); return; }
    if (ref.optedOut) { skip('opted out'); return; }
    if (!ref.phone) { skip('no phone'); return; }
    if (!isAllowedNumber(ref.phone)) { skip('not on test-phone allowlist'); return; }

    // Minors: never text (R7.4). Unsupported language: staff + interpreter (R8.3).
    if (ref.dobIso && ageOn(ref.dobIso, now, d.tz) < 18) {
      await repo.getConv(q, ref.id);
      await amber(ref, 'minor', 'Patient is under 18 on file — not texted. Staff to contact the family.');
      skip('minor'); return;
    }
    if (!repo.langFromPatient(ref.language)) {
      await repo.getConv(q, ref.id);
      await amber(ref, 'language_barrier', `Preferred language on file is ${ref.language}. Texting supports English and Spanish only.`);
      skip('language not supported'); return;
    }

    const verdict = cadenceVerdict({
      cycleStep: conv?.cycleStep ?? 0,
      cycleStartedAt: conv?.cycleStartedAt ?? null,
      lastOutreachAt: conv?.lastOutreachAt ?? null,
      outreachCount: conv?.outreachCount ?? 0,
      repliedSinceOutreach: conv?.repliedSinceOutreach ?? false,
    }, now, settings, d.tz);

    if (verdict.action === 'exhausted') {
      await repo.updateConv(q, ref.id, { exhausted: true });
      await amber(ref, 'cadence_exhausted', 'No reply 72 hours after the final text. Please call the patient.');
      skip('cadence exhausted'); return;
    }
    if (verdict.action === 'wait') { skip(verdict.reason); return; }
    // Pilot mode: the FIRST text of a referral waits for staff approval ("Ready to text").
    if (verdict.step === 0 && (conv?.outreachCount ?? 0) === 0 && settings.approvalRequired && !ref.outreachApprovedAt) {
      skip('awaiting staff approval'); return;
    }
    if (!result.inWindow) { skip('quiet hours'); return; }

    const c = await repo.getConv(q, ref.id);
    const step = verdict.step;
    const templateId = OUTREACH_STEPS[step] ?? 'final_attempt';
    const lang = c.lockedLanguage ?? repo.langFromPatient(ref.language) ?? 'en';

    if (step === 0) {
      if (ref.priority === 'urgent') {
        if (await repo.addNeedsHuman(q, ref.id, 'urgent_referral', 'Urgent referral: call the patient today. Texting runs in parallel.', false, now)) {
          result.amber++;
          await repo.audit(q, SYSTEM_ACTOR, ref.id, 'sms.needs_human', 'Needs a human (urgent referral) · texting continues');
        }
      }
      if (ref.state === 'Queued') {
        await repo.setReferralState(q, ref.id, 'In Progress', now);
        await repo.audit(q, SYSTEM_ACTOR, ref.id, 'referral.state', 'State updated to In Progress (SMS outreach started)');
      }
      // A new conversation: identity must be checked again before any details.
      await repo.updateConv(q, ref.id, {
        cycleStartedAt: now, identityVerified: false, identityAttempts: 0, offeredSlots: [], lockedLanguage: lang,
      });
    }

    await repo.openSmsAttempt(q, ref.id, now, `Text sent: ${templateId.replaceAll('_', ' ')}`);
    const status = await sendTemplate(d, ref, templateId, lang, {}, { actor: AI_ACTOR });
    if (status === 'failed') {
      // Used to be retried silently on every tick (every 5 min). A send that errored or timed out
      // may still have reached the phone, so a blind retry risks duplicate texts; and a number
      // AWS refuses (ConflictException) would fail forever. Pause this referral and tell staff.
      skip('send failed');
      await amber(ref, 'agent_error', `The ${templateId.replaceAll('_', ' ')} text could not be sent (SMS provider error). Texting is paused for this patient: check the number and SMS setup, then resume or call.`);
      return 'failed';
    }
    if (status === 'suppressed') { skip('send suppressed'); return; }
    await repo.updateConv(q, ref.id, {
      cycleStep: step + 1, lastOutreachAt: now, outreachCount: c.outreachCount + 1, repliedSinceOutreach: false,
    });
    result.sent++;
  }
}
