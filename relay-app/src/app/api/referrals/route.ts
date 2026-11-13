// GET /api/referrals — all referrals.  POST /api/referrals — ingest a batch { rows }.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { listReferrals, ingestReferrals, type IngestRow } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listReferrals()));

export const POST = withAuth(async (req, _ctx, user) => {
  const body = await readJson<{ rows?: IngestRow[] }>(req);
  if (!body || !Array.isArray(body.rows) || body.rows.length > 5000) return jsonError(400, 'Expected { rows: [...] }');
  return Response.json(await ingestReferrals(body.rows, user));
});
