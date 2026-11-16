// POST /api/epic/sync — admins only. "Sync from Epic": imports the Epic sandbox patient list as
// referrals (simulated referral feed; manual only). Never sends texts. Returns the sync summary.
import { withAuth, jsonError } from '@/server/auth/guard';
import { EpicSyncError, syncFromEpic } from '@/server/ehr/sync';

export const POST = withAuth(async (_req, _ctx, user) => {
  try {
    return Response.json(await syncFromEpic(user));
  } catch (err) {
    if (err instanceof EpicSyncError) return jsonError(400, err.message);
    throw err;
  }
}, { roles: ['admin'] });
