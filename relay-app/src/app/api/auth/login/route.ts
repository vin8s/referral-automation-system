// GET /api/auth/login?next=/path&lang=es → starts Cognito managed-login sign-in
// (authorization code + PKCE, state, nonce). In mock mode there is nothing to start;
// send the user to the /login picker.

import { NextResponse } from 'next/server';
import { authMode, OIDC_COOKIE } from '@/server/auth/config';
import { startLogin, type UiLang } from '@/server/auth/cognito';
import { pendingCookieOptions, safeNext, signPending } from '@/server/auth/pending';
import { logError } from '@/server/log';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const next = safeNext(params.get('next'));
  const lang: UiLang | undefined = params.get('lang') === 'es' ? 'es' : params.get('lang') === 'en' ? 'en' : undefined;
  const back = (extra: string) => {
    const u = new URL('/login', request.url);
    u.search = extra;
    if (next !== '/dashboard') u.searchParams.set('next', next);
    if (lang === 'es') u.searchParams.set('lang', 'es');
    return u;
  };
  try {
    if (authMode() !== 'cognito') return NextResponse.redirect(back(''));
    const { url, pending } = await startLogin(next, lang);
    const res = NextResponse.redirect(url);
    res.headers.set('Cache-Control', 'no-store');
    res.cookies.set(OIDC_COOKIE, await signPending(pending), pendingCookieOptions());
    return res;
  } catch (err) {
    logError('auth login', err);
    return NextResponse.redirect(back('error=config'));
  }
}
