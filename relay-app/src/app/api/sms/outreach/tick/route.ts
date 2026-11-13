// POST /api/sms/outreach/tick — runs the outreach scheduler once.
//
// Listed in PUBLIC_PATHS (src/proxy.ts) because AWS EventBridge Scheduler calls it
// without a browser session. It authenticates itself, accepting either:
//   - Authorization: Bearer <OUTREACH_CRON_TOKEN>   (scheduler; constant-time compare), or
//   - a signed-in ADMIN session                     ("Run outreach now" button).
// Anything else → 401 (403 for a signed-in non-admin).
//
// Development only: ?now=<ISO time> runs the tick as if it were that time (demo the cadence).

import { timingSafeEqual } from 'node:crypto';
import { getSessionUser, jsonError } from '@/server/auth/guard';
import { logError } from '@/server/log';
import { runOutreachNow } from '@/server/sms';

function bearerOk(req: Request): boolean {
  const expected = process.env.OUTREACH_CRON_TOKEN;
  const header = req.headers.get('authorization') ?? '';
  if (!expected || expected.length < 16 || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!bearerOk(req)) {
    let user = null;
    try { user = await getSessionUser(); } catch { user = null; }
    if (!user) return jsonError(401, 'Not authorized.');
    if (user.role !== 'admin') return jsonError(403, 'Only administrators can run outreach.');
  }

  let now: Date | undefined;
  const nowParam = new URL(req.url).searchParams.get('now');
  if (nowParam) {
    if (process.env.NODE_ENV === 'production') return jsonError(400, 'now= is only allowed in development.');
    now = new Date(nowParam);
    if (isNaN(now.getTime())) return jsonError(400, 'Bad now= time');
  }

  try {
    return Response.json(await runOutreachNow(now));
  } catch (err) {
    logError('POST /api/sms/outreach/tick', err);
    return jsonError(500, 'Outreach run failed.');
  }
}
