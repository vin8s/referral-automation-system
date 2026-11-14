// Short-lived signed cookie that carries OIDC state / nonce / PKCE verifier
// between /api/auth/login and /api/auth/callback. Signed (HS256) and HttpOnly,
// scoped to /api/auth, and good for 15 minutes — long enough for a first sign-in
// (new password + authenticator-app setup), short enough to limit replay.

import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { authSecret, secureCookies } from './config';
import type { PendingLogin } from './cognito';
import { safeNext } from './redirect';

const PENDING_MINUTES = 15;

export async function signPending(p: PendingLogin): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('relay-oidc')
    .setExpirationTime(`${PENDING_MINUTES}m`)
    .sign(authSecret());
}

export async function verifyPending(token: string | undefined): Promise<PendingLogin | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { audience: 'relay-oidc', algorithms: ['HS256'] });
    const { state, nonce, verifier, next, lang } = payload as Record<string, unknown>;
    if (typeof state !== 'string' || typeof nonce !== 'string' || typeof verifier !== 'string') return null;
    return { state, nonce, verifier, next: safeNext(next), lang: lang === 'es' || lang === 'en' ? lang : undefined };
  } catch {
    return null;
  }
}

export const pendingCookieOptions = () => ({
  httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/api/auth', maxAge: PENDING_MINUTES * 60,
});

export { safeNext };
