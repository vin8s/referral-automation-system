// eCW schedule import — entry point for route handlers. Wires the real database,
// clock and clinic time zone, and runs SMS follow-ups after each commit.

import 'server-only';
import { getDb } from '@/server/db';
import { logError } from '@/server/log';
import { smsDeps } from '@/server/sms';
import { afterAppointmentCancelled, afterSlotConfirmed } from '@/server/sms/engine';
import { clinicTimeZone } from '@/server/sms/schedule';
import type { SessionUser } from '@/lib/auth-types';
import * as svc from './service';

export { ImportError } from './service';
export { ImportFileError, MAX_FILE_BYTES } from './parse';

async function ctx(): Promise<svc.ImportCtx> {
  const hours = Number(process.env.ECW_IMPORT_STALE_HOURS);
  return { db: await getDb(), now: () => new Date(), tz: clinicTimeZone(), staleHours: Number.isFinite(hours) && hours > 0 ? hours : 24 };
}

/**
 * After an import commits: cancelled appointments get `cancellation_reoffer`; referrals that
 * were waiting in the confirm queue get `booked_confirmation` (same as the MA's Confirm).
 * An SMS problem never undoes or fails the import.
 */
async function runFollowUps(list: svc.FollowUp[]): Promise<void> {
  if (!list.length) return;
  let d: Awaited<ReturnType<typeof smsDeps>>;
  try {
    d = await smsDeps(); // throws if SMS is misconfigured (e.g. mock in production)
  } catch (err) {
    logError('ecw import sms follow-up (setup)', err);
    return;
  }
  for (const f of list) {
    try {
      if (f.kind === 'cancelled') await afterAppointmentCancelled(d, f.referralId);
      else await afterSlotConfirmed(d, f.referralId);
    } catch (err) {
      logError(`ecw import sms follow-up (${f.kind})`, err);
    }
  }
}

export async function uploadSchedule(user: SessionUser, file: { name: string; bytes: Buffer }) {
  return svc.createDraft(await ctx(), user, file);
}

export async function previewSchedule(id: string, mapping: unknown, options: unknown) {
  return svc.previewDraft(await ctx(), id, mapping, options);
}

export async function applySchedule(user: SessionUser, id: string, mapping: unknown, options: unknown, saveProfileName?: string | null) {
  const { result, followUps } = await svc.applyDraft(await ctx(), user, id, mapping, options, saveProfileName);
  await runFollowUps(followUps);
  return result;
}

export async function discardSchedule(user: SessionUser, id: string) {
  return svc.discardDraft(await ctx(), user, id);
}

export async function resolveReviewItem(user: SessionUser, itemId: string, action: 'match' | 'ignore', referralId?: string) {
  const { result, followUps } = await svc.resolveReview(await ctx(), user, itemId, action, referralId);
  await runFollowUps(followUps);
  return result;
}

export async function getImportOverview() { return svc.getOverview(await ctx()); }
export async function getImportDetail(id: string) { return svc.getImportDetail(await ctx(), id); }
export async function getImportStatus() { return svc.getStatus(await ctx()); }
export async function getTakenSlots() { return svc.listTakenSlots(await ctx()); }
