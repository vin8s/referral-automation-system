// GET /api/auth/callback — Cognito redirects here with ?code=&state=.

import { NextResponse } from 'next/server';
import { authMode, OIDC_COOKIE } from '@/server/auth/config';
import { finishLogin } from '@/server/auth/cognito';
import { verifyPending } from '@/server/auth/pending';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/server/auth/session';
import { logError } from '@/server/log';

function toLogin(request: Request, error: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
  return res;
}

export async function GET(request: Request) {
  try {
    if (authMode() !== 'cognito') return toLogin(request, 'config');
    const cookieHeader = request.headers.get('cookie') ?? '';
    const raw = cookieHeader.split(/;\s*/).find(c => c.startsWith(`${OIDC_COOKIE}=`))?.slice(OIDC_COOKIE.length + 1);
    const pending = await verifyPending(raw);
    if (!pending) return toLogin(request, 'expired');

    const user = await finishLogin(new URL(request.url).search, pending);
    if (user === 'no_role') return toLogin(request, 'no_role');

    const res = NextResponse.redirect(new URL(pending.next, request.url));
    res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
    res.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
    return res;
  } catch (err) {
    logError('auth callback', err);
    return toLogin(request, 'signin_failed');
  }
}
