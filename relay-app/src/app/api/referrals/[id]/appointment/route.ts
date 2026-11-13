import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { updateAppointment, cancelAppointment } from '@/server/referrals';

type Ctx = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

type Updates = { day?: string; time?: string; provider?: string; location?: string };

// PATCH { updates } — edit the confirmed appointment shown on the calendar.
export const PATCH = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ updates?: Updates }>(req);
  const u = body?.updates;
  if (!validId(id) || !u || typeof u !== 'object') return jsonError(400, 'Expected { updates }');
  const clean: Updates = {};
  for (const k of ['day', 'time', 'provider', 'location'] as const) {
    if (typeof u[k] === 'string') clean[k] = u[k];
  }
  return Response.json(await updateAppointment(id, clean, user));
});

// DELETE — cancel the confirmed appointment (referral returns to Pending Confirmation).
export const DELETE = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  if (!validId(id)) return jsonError(400, 'Bad referral id');
  return Response.json(await cancelAppointment(id, user));
});
