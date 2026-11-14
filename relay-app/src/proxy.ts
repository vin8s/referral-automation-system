// Next.js 16 Proxy (formerly "middleware"): first line of defense.
// Signed-out requests: pages → redirect to /login, /api/* → 401 JSON.
// Expired sessions: pages → /login?reason=idle|absolute, /api/* → 401 { code: 'session_expired' }.
// Active sessions: the cookie is re-signed now and then so the idle timer slides forward.
// Route handlers and the app layout re-check the session themselves, so this is
// an optimistic gate, not the only one.

import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE, checkSession, sessionCookieOptions, shouldRenew, signSession, type SessionCheck,
} from '@/server/auth/session';
import { isCrossSiteWrite } from '@/server/auth/csrf';

// Public paths authenticate themselves:
//   /api/sms/inbound        — SNS signature + topic check (AWS End User Messaging inbound SMS)
//   /api/sms/outreach/tick  — bearer OUTREACH_CRON_TOKEN (EventBridge Scheduler) or an admin session
const PUBLIC_PATHS = ['/login', '/api/auth/', '/api/sms/inbound', '/api/sms/outreach/tick', '/api/sms/twilio/inbound'];

/**
 * What counts as "activity" for the idle timer: page loads/navigations and API
 * writes. Background GET polling and link prefetches do NOT keep a session alive,
 * so an unattended screen still signs out.
 */
function isActivity(request: NextRequest): boolean {
  if (request.headers.get('next-router-prefetch') || request.headers.get('purpose') === 'prefetch') return false;
  if (request.nextUrl.pathname.startsWith('/api/')) return request.method !== 'GET' && request.method !== 'HEAD';
  return true;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // CSRF: a browser write from another site is refused before anything else, public paths
  // included (e.g. a forged logout / mock-login). Webhooks send no Origin and pass through.
  if (pathname.startsWith('/api/') && isCrossSiteWrite(request.method, request.headers)) {
    return NextResponse.json({ error: 'Cross-site request refused.', code: 'cross_site' }, { status: 403 });
  }
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  let check: SessionCheck;
  try {
    check = await checkSession(request.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    check = { status: 'invalid' }; // e.g. AUTH_SECRET missing in production → fail closed
  }

  if (check.status === 'valid') {
    const res = NextResponse.next();
    if (isActivity(request) && shouldRenew(check)) {
      try {
        res.cookies.set(SESSION_COOKIE, await signSession(check.user, { authTime: check.authTime }),
          sessionCookieOptions(check.authTime));
      } catch { /* renewal is best-effort; the current cookie is still valid */ }
    }
    return res;
  }

  const expired = check.status === 'expired' ? check.reason : null;
  let res: NextResponse;
  if (pathname.startsWith('/api/')) {
    res = NextResponse.json(
      expired ? { error: 'Your session has ended. Please sign in again.', code: 'session_expired', reason: expired }
        : { error: 'Not signed in.', code: 'unauthenticated' },
      { status: 401 },
    );
  } else {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    if (expired) login.searchParams.set('reason', expired);
    res = NextResponse.redirect(login);
  }
  if (check.status !== 'none') res.cookies.delete(SESSION_COOKIE); // expired or tampered: drop it
  return res;
}

export const config = {
  // Everything except Next internals and static files in /public.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)'],
};
