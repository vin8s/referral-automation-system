import { withAuth } from '@/server/auth/guard';
import { getAnalytics } from '@/server/staticData';

export const GET = withAuth(async () => Response.json(getAnalytics()));
