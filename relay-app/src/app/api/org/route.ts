import { withAuth } from '@/server/auth/guard';
import { getOrg } from '@/server/staticData';

export const GET = withAuth(async () => Response.json(getOrg()));
