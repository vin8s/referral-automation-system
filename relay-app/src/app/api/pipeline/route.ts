import { withAuth } from '@/server/auth/guard';
import { getPipeline } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await getPipeline()));
