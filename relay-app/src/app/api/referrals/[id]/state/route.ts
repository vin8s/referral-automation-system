import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { updateReferralState, REFERRAL_STATES } from '@/server/referrals';
import type { ReferralState } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const PUT = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ state?: string }>(req);
  if (!validId(id) || !REFERRAL_STATES.includes(body?.state as ReferralState)) return jsonError(400, 'Invalid state');
  return Response.json(await updateReferralState(id, body!.state as ReferralState, user));
});
