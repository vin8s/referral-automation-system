// GET /api/sms/settings — any signed-in user.  PUT — admins only (includes the "Pause all texting" switch).
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { getOutreachSettingsView, saveOutreachSettings } from '@/server/sms';

export const GET = withAuth(async () => Response.json(await getOutreachSettingsView()));

export const PUT = withAuth(async (req, _ctx, user) => {
  const body = await readJson<unknown>(req);
  if (!body || typeof body !== 'object') return jsonError(400, 'Expected settings object');
  return Response.json(await saveOutreachSettings(body, user));
}, { roles: ['admin'] });
