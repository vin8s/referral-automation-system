// POST — MA rejects the AI-captured slot. The referral re-enters outreach and, if the
// patient is mid-SMS-conversation, new times are offered by text automatically.
import { withAuth, jsonError } from '@/server/auth/guard';
import { rejectSlot } from '@/server/referrals';
import { capturedSlotOf, smsAfterReject } from '@/server/sms';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  const rejected = await capturedSlotOf(id);
  const result = await rejectSlot(id, user);
  if (result.success) await smsAfterReject(id, rejected);
  return Response.json(result);
});
