// POST /api/schedule-import/review/:itemId { action: 'match', referralId } | { action: 'ignore' }
// Staff decide on an eCW row the import would not guess on.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { ImportError, resolveReviewItem } from '@/server/import';

type Ctx = { params: Promise<{ itemId: string }> };

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { itemId } = await params;
  const body = await readJson<{ action?: string; referralId?: string }>(req);
  if (!body || (body.action !== 'match' && body.action !== 'ignore')) return jsonError(400, "Expected { action: 'match' | 'ignore' }");
  try {
    return Response.json(await resolveReviewItem(user, itemId, body.action, typeof body.referralId === 'string' ? body.referralId.trim() : undefined));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
