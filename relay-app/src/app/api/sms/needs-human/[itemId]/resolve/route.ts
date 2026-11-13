// POST /api/sms/needs-human/:itemId/resolve — staff mark an amber item handled.
import { withAuth, jsonError } from '@/server/auth/guard';
import { resolveNeedsHumanItem } from '@/server/sms';

type Ctx = { params: Promise<{ itemId: string }> };

export const POST = withAuth(async (_req, { params }: Ctx, user) => {
  const { itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return jsonError(400, 'Bad item id');
  return (await resolveNeedsHumanItem(itemId, user))
    ? Response.json({ success: true })
    : jsonError(404, 'Item not found or already resolved');
});
