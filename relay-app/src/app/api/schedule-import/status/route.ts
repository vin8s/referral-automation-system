// GET /api/schedule-import/status — when the eCW schedule was last imported (stale warning) + open review rows.
import { withAuth } from '@/server/auth/guard';
import { getImportStatus } from '@/server/import';

export const GET = withAuth(async () => Response.json(await getImportStatus()));
