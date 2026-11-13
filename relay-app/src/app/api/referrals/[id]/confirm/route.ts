// POST — MA confirms the AI-captured slot (connector mode: the MA has booked it in the practice system).
import { withAuth, jsonError } from '@/server/auth/guard';
import { confirmSlot } from '@/server/referrals';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  return Response.json(await confirmSlot(id, user));
});
