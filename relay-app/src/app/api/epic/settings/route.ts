// GET /api/epic/settings — any signed-in staff member (read-only view of the Epic sandbox prototype).
// PUT /api/epic/settings { bookingEnabled, patients } — admins only. 400 with the validation message.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { EpicSettingsError, getEpicSettingsView, saveEpicSettings, type EpicFeedPatient } from '@/server/ehr';

export const GET = withAuth(async () => Response.json(await getEpicSettingsView()));

export const PUT = withAuth(async (req, _ctx, user) => {
  const body = await readJson<{ bookingEnabled?: unknown; patients?: unknown }>(req);
  if (!body || typeof body !== 'object') return jsonError(400, 'Expected { bookingEnabled, patients }');
  try {
    await saveEpicSettings(
      { bookingEnabled: body.bookingEnabled as boolean, patients: body.patients as EpicFeedPatient[] }, user.name);
  } catch (err) {
    if (err instanceof EpicSettingsError) return jsonError(400, err.message);
    throw err;
  }
  return Response.json(await getEpicSettingsView());
}, { roles: ['admin'] });
