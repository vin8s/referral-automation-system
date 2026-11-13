import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { getReferralForView, updateReferral, type ReferralDraft } from '@/server/referrals';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

// GET — opening a referral is recorded in the audit log.
export const GET = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const referral = await getReferralForView(id, user);
  return referral ? Response.json(referral) : jsonError(404, 'Referral not found');
});

// PATCH { draft, comment } — manual edit of patient / referral fields.
export const PATCH = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ draft?: ReferralDraft; comment?: string }>(req);
  if (!validId(id) || !body?.draft || typeof body.draft !== 'object') return jsonError(400, 'Expected { draft }');
  return Response.json(await updateReferral(id, body.draft, body.comment, user));
});
