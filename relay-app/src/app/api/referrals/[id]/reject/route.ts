import { withAuth, jsonError } from '@/server/auth/guard';
import { rejectSlot } from '@/server/referrals';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  return Response.json(await rejectSlot(id, user));
});
