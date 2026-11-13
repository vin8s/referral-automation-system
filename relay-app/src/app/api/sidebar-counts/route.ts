import { withAuth } from '@/server/auth/guard';
import { getSidebarCounts } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await getSidebarCounts()));
