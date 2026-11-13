import { withAuth } from '@/server/auth/guard';
import { listCalendarEvents } from '@/server/referrals';

export const GET = withAuth(async () => Response.json(await listCalendarEvents()));
