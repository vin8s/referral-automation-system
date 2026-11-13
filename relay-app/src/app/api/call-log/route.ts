import { withAuth } from '@/server/auth/guard';
import { listCallLog } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listCallLog()));
