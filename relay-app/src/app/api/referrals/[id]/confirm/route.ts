// POST — MA confirms the AI-captured slot (connector mode: the MA has booked it in the practice system).
// If the slot came from an SMS conversation, the patient gets the booked_confirmation text.
import { withAuth, jsonError } from '@/server/auth/guard';
import { confirmSlot } from '@/server/referrals';
import { smsAfterConfirm } from '@/server/sms';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const result = await confirmSlot(id, user);
  if (result.success) await smsAfterConfirm(id);
  return Response.json(result);
});
