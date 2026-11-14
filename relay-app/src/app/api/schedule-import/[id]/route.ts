// GET    /api/schedule-import/:id — one import (summary + its review items).
// DELETE /api/schedule-import/:id — discard a draft that was never applied (its parsed rows are deleted).
import { withAuth, jsonError } from '@/server/auth/guard';
import { discardSchedule, getImportDetail, ImportError } from '@/server/import';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const detail = await getImportDetail(id);
  return detail ? Response.json(detail) : jsonError(404, 'Import not found.');
});

export const DELETE = withAuth(async (_req, { params }: Ctx, user) => {
  const { id } = await params;
  try {
    await discardSchedule(user, id);
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof ImportError) return jsonError(err.status, err.message);
    throw err;
  }
});
