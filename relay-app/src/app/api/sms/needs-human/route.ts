// GET /api/sms/needs-human — open amber "needs a human" items across all referrals.
import { withAuth } from '@/server/auth/guard';
import { listNeedsHuman } from '@/server/sms';

export const GET = withAuth(async () => Response.json(await listNeedsHuman()));
