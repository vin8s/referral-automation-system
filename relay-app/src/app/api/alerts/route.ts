import { withAuth } from '@/server/auth/guard';
import { listUrgentAlerts } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listUrgentAlerts()));
