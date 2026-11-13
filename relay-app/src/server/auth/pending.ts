// Short-lived signed cookie that carries OIDC state / nonce / PKCE verifier
// between /api/auth/login and /api/auth/callback.

import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { authSecret, secureCookies } from './config';
import type { PendingLogin } from './cognito';

export async function signPending(p: PendingLogin): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('relay-oidc')
    .setExpirationTime('10m')
    .sign(authSecret());
}

export async function verifyPending(token: string | undefined): Promise<PendingLogin | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { audience: 'relay-oidc', algorithms: ['HS256'] });
    const { state, nonce, verifier, next } = payload as Record<string, unknown>;
    if (typeof state !== 'string' || typeof nonce !== 'string' || typeof verifier !== 'string') return null;
    return { state, nonce, verifier, next: typeof next === 'string' ? next : '/dashboard' };
  } catch {
    return null;
  }
}

export const pendingCookieOptions = () => ({
  httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/api/auth', maxAge: 600,
});

/** Only allow same-site relative redirects after login. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next : '/dashboard';
}
