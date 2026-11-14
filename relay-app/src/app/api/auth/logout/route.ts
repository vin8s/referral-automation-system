// POST /api/auth/logout — clears the Relay session, then (Cognito) ends the managed-login
// session at Cognito's /logout endpoint, which returns to /login?signed_out=1.
// POST only, so a link or image on another site can't sign staff out.

import { NextResponse } from 'next/server';
import { authMode, OIDC_COOKIE } from '@/server/auth/config';
import { cognitoLogoutUrl, LOGOUT_RETURN_PATHS } from '@/server/auth/cognito';
import { SESSION_COOKIE } from '@/server/auth/session';

export async function POST(request: Request) {
  let target: string | null = null;
  try {
    if (authMode() === 'cognito') target = cognitoLogoutUrl(LOGOUT_RETURN_PATHS.signedOut);
  } catch { /* misconfigured: still clear the cookie */ }
  const res = NextResponse.redirect(target ?? new URL(LOGOUT_RETURN_PATHS.signedOut, request.url), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete({ name: OIDC_COOKIE, path: '/api/auth' });
  return res;
}
