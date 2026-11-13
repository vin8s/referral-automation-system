// Next.js 16 Proxy (formerly "middleware"): first line of defense.
// Signed-out requests: pages → redirect to /login, /api/* → 401 JSON.
// Route handlers and the app layout re-check the session themselves, so this is
// an optimistic gate, not the only one.

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/server/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth/'];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  let signedIn = false;
  try {
    signedIn = (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) !== null;
  } catch {
    signedIn = false; // e.g. AUTH_SECRET missing in production → fail closed
  }
  if (signedIn) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next internals and static files in /public.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)'],
};
