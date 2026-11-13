// GET /api/me — the signed-in staff member plus feature flags for the UI.
import { withAuth } from '@/server/auth/guard';
import { voiceEnabled } from '@/server/config';
import { fmtToday } from '@/server/referrals';
import { ROLE_LABEL } from '@/lib/auth-types';

export const GET = withAuth(async (_req, _ctx, user) => Response.json({
  id: user.id,
  name: user.name.split(' ')[0],
  fullName: user.name,
  role: ROLE_LABEL[user.role],
  roleKey: user.role,
  initials: user.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase(),
  today: fmtToday(),
  voiceEnabled: voiceEnabled(),
}));
