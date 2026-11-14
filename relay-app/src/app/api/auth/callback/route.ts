// GET /api/auth/callback — Cognito redirects here with ?code=&state=
// (or ?error=… when sign-in didn't complete).

import { NextResponse } from 'next/server';
import { authMode, OIDC_COOKIE } from '@/server/auth/config';
import { cognitoLogoutUrl, finishLogin, LOGOUT_RETURN_PATHS } from '@/server/auth/cognito';
import { mapAuthorizeError, mapCallbackException, type LoginError } from '@/server/auth/errors';
import { verifyPending } from '@/server/auth/pending';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/server/auth/session';
import { logError } from '@/server/log';

function toLogin(request: Request, error: LoginError, lang?: string) {
  const url = new URL(`/login?error=${error}`, request.url);
  if (lang === 'es') url.searchParams.set('lang', 'es');
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
  return res;
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  try {
    if (authMode() !== 'cognito') return toLogin(request, 'config');
    const cookieHeader = request.headers.get('cookie') ?? '';
    const raw = cookieHeader.split(/;\s*/).find(c => c.startsWith(`${OIDC_COOKIE}=`))?.slice(OIDC_COOKIE.length + 1);
    const pending = await verifyPending(raw);

    // Cognito reported an error (e.g. access_denied). Log only the OAuth code — never descriptions.
    const oauthError = search.get('error');
    if (oauthError) {
      const mapped = mapAuthorizeError(oauthError);
      if (mapped !== 'cancelled') logError('auth callback', { name: 'AuthorizeError', code: oauthError.slice(0, 40) });
      return toLogin(request, mapped, pending?.lang);
    }
    if (!pending) return toLogin(request, 'attempt_expired');
    if (!search.get('code')) return toLogin(request, 'signin_failed', pending.lang);

    const user = await finishLogin(new URL(request.url).search, pending);
    if (user === 'no_role') {
      // Signed in to Cognito but not allowed into Relay: end the Cognito session too,
      // so the next attempt (perhaps a colleague on the same computer) starts clean.
      const logout = cognitoLogoutUrl(LOGOUT_RETURN_PATHS.noRole);
      if (!logout) return toLogin(request, 'no_role', pending.lang);
      const res = NextResponse.redirect(logout);
      res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
      return res;
    }

    const res = NextResponse.redirect(new URL(pending.next, request.url));
    res.headers.set('Cache-Control', 'no-store');
    res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
    res.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
    return res;
  } catch (err) {
    logError('auth callback', err);
    return toLogin(request, mapCallbackException(err));
  }
}
