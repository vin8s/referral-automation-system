import { withAuth } from '@/server/auth/guard';
import { listReferralLog } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listReferralLog()));
