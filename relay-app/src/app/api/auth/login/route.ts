// GET /api/auth/login?next=/path → starts Cognito hosted-UI sign-in.
// In mock mode there is nothing to start; send the user to the /login picker.

import { NextResponse } from 'next/server';
import { authMode, OIDC_COOKIE } from '@/server/auth/config';
import { startLogin } from '@/server/auth/cognito';
import { pendingCookieOptions, safeNext, signPending } from '@/server/auth/pending';
import { logError } from '@/server/log';

export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  try {
    if (authMode() !== 'cognito') {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
    }
    const { url, pending } = await startLogin(next);
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, await signPending(pending), pendingCookieOptions());
    return res;
  } catch (err) {
    logError('auth login', err);
    return NextResponse.redirect(new URL('/login?error=config', request.url));
  }
}
