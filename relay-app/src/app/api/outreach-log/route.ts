// GET /api/outreach-log — every text-outreach attempt, newest first.
import { withAuth } from '@/server/auth/guard';
import { listOutreachLog } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listOutreachLog()));
