import { withAuth } from '@/server/auth/guard';
import { listConfirmQueue } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listConfirmQueue()));
