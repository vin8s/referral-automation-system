// Automatic outreach: runs the outreach tick on a timer inside the Relay server.
//
// Texts go out without anyone clicking a button:
//   - right after referrals are imported (POST /api/referrals), and
//   - every OUTREACH_AUTORUN_SECONDS (default 300) for follow-ups, quiet-hour holds
//     and referrals whose consent was recorded later.
// Every tick still applies consent, opt-out, quiet hours, the 0/2/5/9-day cadence
// and the lifetime cap, so running often never texts anyone early or twice.
//
// On by default in development. In production the AWS EventBridge schedule already
// calls /api/sms/outreach/tick; set OUTREACH_AUTORUN=on only if the server runs as a
// single instance without that schedule. OUTREACH_AUTORUN=off turns it off anywhere.

import { logError } from '@/server/log';

const g = globalThis as unknown as { __relayOutreachTimer?: ReturnType<typeof setInterval> };

export function outreachAutorunEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.OUTREACH_AUTORUN?.toLowerCase();
  if (flag === 'off' || flag === 'false' || flag === '0') return false;
  if (flag === 'on' || flag === 'true' || flag === '1') return true;
  return env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test';
}

export function outreachAutorunSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.OUTREACH_AUTORUN_SECONDS);
  return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 300;
}

export function startOutreachAutorun(): void {
  if (!outreachAutorunEnabled() || g.__relayOutreachTimer) return;
  const tick = async () => {
    try {
      const { runOutreachNow } = await import('@/server/sms');
      const r = await runOutreachNow();
      if (r.sent || r.amber || r.heldReleased) {
        console.log(`[relay] automatic outreach: ${r.sent} sent, ${r.heldReleased} released, ${r.amber} need a human`);
      }
    } catch (err) {
      logError('automatic outreach', err);
    }
  };
  const seconds = outreachAutorunSeconds();
  g.__relayOutreachTimer = setInterval(tick, seconds * 1000);
  g.__relayOutreachTimer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  console.log(`[relay] automatic outreach on: every ${seconds}s and after each referral import`);
}
