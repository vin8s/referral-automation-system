// GET /api/settings — any signed-in user.  PUT — admins only.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { getSettings, saveSettings } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await getSettings()));

export const PUT = withAuth(async (req, _ctx, user) => {
  const body = await readJson<unknown>(req);
  if (!body || typeof body !== 'object') return jsonError(400, 'Expected settings object');
  return Response.json(await saveSettings(body, user));
}, { roles: ['admin'] });
