// GET /api/referrals — all referrals.
// POST /api/referrals — ingest referrals { rows, via?: 'upload' | 'manual' }, then start outreach.
import { after } from 'next/server';
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { runOutreachSoon } from '@/server/sms';
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
  const result = await ingestReferrals(rows, user, body.via === 'manual' ? 'manual' : 'upload');
  // New referrals get their first text right away (within quiet hours); recorded consent is not
  // required (owner decision 2026-11-14). The outreach tick applies opt-out, cadence and quiet-hour rules.
  if (result.importedCount > 0) after(() => runOutreachSoon('referral import'));
  return Response.json(result);
});
