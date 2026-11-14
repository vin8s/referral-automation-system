// GET /api/referrals — all referrals.
// POST /api/referrals — ingest referrals { rows, via?: 'upload' | 'manual' }.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { listReferrals, ingestReferrals, type IngestRow } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listReferrals()));

export const POST = withAuth(async (req, _ctx, user) => {
  const body = await readJson<{ rows?: IngestRow[]; via?: unknown }>(req);
  if (!body || !Array.isArray(body.rows) || body.rows.length > 5000) return jsonError(400, 'Expected { rows: [...] }');
  // Consent must be an explicit boolean true; strings like "yes" from a client are not accepted here.
  const rows = body.rows.map(r => ({
    ...r,
    smsConsent: r?.smsConsent === true,
    smsConsentSource: typeof r?.smsConsentSource === 'string' ? r.smsConsentSource : undefined,
  }));
  return Response.json(await ingestReferrals(rows, user, body.via === 'manual' ? 'manual' : 'upload'));
});
