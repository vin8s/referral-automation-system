import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { addCallAttempt } from '@/server/referrals';
import type { Attempt } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ attempt?: Omit<Attempt, 'n'> }>(req);
  const a = body?.attempt;
  if (!validId(id) || !a || (a.channel !== 'voice' && a.channel !== 'sms') || typeof a.outcome !== 'string') {
    return jsonError(400, 'Invalid attempt');
  }
  return Response.json(await addCallAttempt(id, a, user));
});
