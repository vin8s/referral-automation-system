// GET  /api/sms/ready-to-text — pilot mode: referrals waiting for staff approval before their first text.
// POST /api/sms/ready-to-text { referralIds: string[] } — approve them; outreach then starts by itself.
// Any signed-in staff member (MA or admin) may approve.
import { after } from 'next/server';
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { approveForTexting, listReadyToText, runOutreachSoon } from '@/server/sms';

export const GET = withAuth(async () => Response.json(await listReadyToText()));

export const POST = withAuth(async (req, _ctx, user) => {
  const body = await readJson<{ referralIds?: unknown }>(req);
  if (!body || !Array.isArray(body.referralIds) || body.referralIds.length === 0) {
    return jsonError(400, 'Expected { referralIds: [...] }');
  }
  const result = await approveForTexting(body.referralIds, user);
  if (result.approved.length) after(() => runOutreachSoon('staff approval'));
  return Response.json(result);
});
