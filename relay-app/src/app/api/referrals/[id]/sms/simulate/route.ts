// POST /api/referrals/:id/sms/simulate { body } — "Patient simulator (prototype)".
// Only with SMS_PROVIDER=mock: injects a FAKE patient reply through the real inbound flow.
import { withAuth, jsonError, readJson } from '@/server/auth/guard';
import { simulatePatientText, SmsActionError } from '@/server/sms';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return jsonError(400, 'Bad referral id');
  const body = await readJson<{ body?: unknown }>(req);
  if (typeof body?.body !== 'string') return jsonError(400, 'Expected { body }');
  try {
    return Response.json({ success: true, ...(await simulatePatientText(id, body.body, user)) });
  } catch (err) {
    if (err instanceof SmsActionError) return jsonError(err.status, err.message);
    throw err;
  }
});
