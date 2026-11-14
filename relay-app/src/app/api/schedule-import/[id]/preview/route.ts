// POST /api/schedule-import/:id/preview { mapping, options } — dry run with adjusted column mapping. Changes nothing.
import { withAuth, readJson, jsonError } from '@/server/auth/guard';
import { ImportError, previewSchedule } from '@/server/import';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(async (req, { params }: Ctx) => {
  const { id } = await params;
  const body = await readJson<{ mapping?: unknown; options?: unknown }>(req);
  if (!body || typeof body.mapping !== 'object') return jsonError(400, 'Expected { mapping, options }');
  try {
    return Response.json(await previewSchedule(id, body.mapping, body.options));
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
