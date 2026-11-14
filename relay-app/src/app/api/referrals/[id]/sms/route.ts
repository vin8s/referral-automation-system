// GET   /api/referrals/:id/sms — SMS thread, consent, conversation state, open amber items.
// POST  /api/referrals/:id/sms — staff "Send text" { body }.
// PATCH /api/referrals/:id/sms — { paused?, channelPreference?, consent?, consentSource? }.
import { withAuth, jsonError, readJson } from '@/server/auth/guard';
import { getSmsThread, sendStaffText, SmsActionError, updateSmsPreferences } from '@/server/sms';
import type { SmsChannelPreference } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

function actionError(err: unknown): Response {
  if (err instanceof SmsActionError) return jsonError(err.status, err.message);
  throw err;
}

export const GET = withAuth(async (_req, { params }: Ctx) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const thread = await getSmsThread(id);
  return thread ? Response.json(thread) : jsonError(404, 'Referral not found');
});

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const body = await readJson<{ body?: unknown }>(req);
  if (typeof body?.body !== 'string') return jsonError(400, 'Expected { body }');
  try {
    const status = await sendStaffText(id, body.body, user);
    return Response.json({ success: status !== 'failed' && status !== 'suppressed', status });
  } catch (err) {
    return actionError(err);
  }
});

const CHANNELS: SmsChannelPreference[] = ['sms', 'none'];

export const PATCH = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const b = await readJson<Record<string, unknown>>(req);
  if (!b || typeof b !== 'object') return jsonError(400, 'Expected an object');
  if (b.paused !== undefined && typeof b.paused !== 'boolean') return jsonError(400, 'paused must be boolean');
  if (b.consent !== undefined && typeof b.consent !== 'boolean') return jsonError(400, 'consent must be boolean');
  if (b.channelPreference !== undefined && !CHANNELS.includes(b.channelPreference as SmsChannelPreference)) {
    return jsonError(400, 'channelPreference must be sms or none');
  }
  try {
    const ok = await updateSmsPreferences(id, {
      paused: b.paused as boolean | undefined,
      consent: b.consent as boolean | undefined,
      consentSource: typeof b.consentSource === 'string' ? b.consentSource : undefined,
      channelPreference: b.channelPreference as SmsChannelPreference | undefined,
    }, user);
    return ok ? Response.json({ success: true }) : jsonError(404, 'Referral not found');
  } catch (err) {
    return actionError(err);
  }
});
