// POST /api/schedule-import/:id/apply { mapping, options, saveProfileName? } — applies the previewed import.
// Updates Relay only (connector mode: nothing is ever written to eCW). Safe to repeat: re-imports change nothing twice.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { applySchedule, ImportError } from '@/server/import';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(async (req, { params }: Ctx, user) => {
  const { id } = await params;
  const body = await readJson<{ mapping?: unknown; options?: unknown; saveProfileName?: unknown }>(req);
  if (!body) return jsonError(400, 'Expected { mapping, options }');
  const name = typeof body.saveProfileName === 'string' ? body.saveProfileName : null;
  try {
    return Response.json(await applySchedule(user, id, body.mapping, body.options, name));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
