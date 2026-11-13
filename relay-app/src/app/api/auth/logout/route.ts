// POST /api/auth/logout — clears the Relay session, then (Cognito) ends the hosted-UI session.

import { NextResponse } from 'next/server';
import { authMode } from '@/server/auth/config';
import { cognitoLogoutUrl } from '@/server/auth/cognito';
import { SESSION_COOKIE } from '@/server/auth/session';

export async function POST(request: Request) {
  let target: string | null = null;
  try {
    if (authMode() === 'cognito') target = cognitoLogoutUrl();
  } catch { /* misconfigured: still clear the cookie */ }
  const res = NextResponse.redirect(target ?? new URL('/login?signed_out=1', request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
