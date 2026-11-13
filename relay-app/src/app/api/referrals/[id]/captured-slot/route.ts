import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { createCapturedSlot } from '@/server/referrals';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ slot?: { day?: unknown; time?: unknown; provider?: unknown } }>(req);
  const s = body?.slot;
  if (!validId(id) || !s || typeof s.day !== 'string' || typeof s.time !== 'string' || typeof s.provider !== 'string') {
    return jsonError(400, 'Expected { slot: { day, time, provider } }');
  }
  return Response.json(await createCapturedSlot(id, { day: s.day, time: s.time, provider: s.provider }, user));
});
