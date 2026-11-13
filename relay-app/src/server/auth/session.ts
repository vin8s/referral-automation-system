// Stateless session: a signed (HS256) JWT in an HttpOnly cookie.
// Payload holds only staff id / name / role — never patient data.
// No 'server-only' import because src/proxy.ts verifies sessions too.

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { authSecret, SESSION_HOURS, secureCookies, SESSION_COOKIE } from './config';
import type { Role, SessionUser } from '@/lib/auth-types';

const ISSUER = 'relay';
const AUDIENCE = 'relay-session';

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(authSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<JWTPayload & { name?: string; email?: string; role?: string }>(
      token, authSecret(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (!payload.sub || (payload.role !== 'ma' && payload.role !== 'admin')) return null;
    return { id: payload.sub, name: payload.name ?? 'Staff', email: payload.email, role: payload.role as Role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  };
}

export { SESSION_COOKIE };
