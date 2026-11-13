import { withAuth } from '@/server/auth/guard';
import { listConfirmQueue } from '@/server/referrals';
import { withSmsExcerpts } from '@/server/sms';

export const GET = withAuth(async () => Response.json(await withSmsExcerpts(await listConfirmQueue())));
