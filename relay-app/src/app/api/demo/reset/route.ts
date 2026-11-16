// POST /api/demo/reset — admins only. Deletes all demo referral/patient data (Settings → Demo data).
// Body must be { "confirm": "RESET" }. Refused (403) with NODE_ENV=production unless DEMO_RESET_ENABLED=true.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { getDb } from '@/server/db';
import { DemoResetRefused, assertDemoResetAllowed, resetDemoData } from '@/server/demoReset';

export const POST = withAuth(async (req, _ctx, user) => {
  try {
    assertDemoResetAllowed();
  } catch (err) {
    if (err instanceof DemoResetRefused) return jsonError(403, err.message);
    throw err;
  }
  const body = await readJson<{ confirm?: unknown }>(req);
  if (body?.confirm !== 'RESET') return jsonError(400, 'Type RESET to confirm.');
  const result = await resetDemoData(await getDb(), user);
  return Response.json({ success: true, ...result });
}, { roles: ['admin'], name: 'demo reset' });
