import { withAuth } from '@/server/auth/guard';
import { getRawSettings } from '@/server/staticData';

export const GET = withAuth(async () => Response.json(getRawSettings()));
