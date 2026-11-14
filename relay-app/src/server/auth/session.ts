// Stateless session: a signed (HS256) JWT in an HttpOnly cookie.
// Payload holds only staff id / name / role — never patient data.
// No 'server-only' import because src/proxy.ts verifies sessions too.
//
// Two limits (HIPAA "automatic logoff"):
//   • idle     — SESSION_IDLE_MINUTES without activity. src/proxy.ts re-signs the
//                cookie on activity ("sliding" expiry), so `exp` moves forward.
//   • absolute — SESSION_HOURS after sign-in (`ats`, auth time), however active.
// The JWT's `exp` is the earlier of the two. The cookie itself lives a little
// longer than the absolute limit so an expired session can be *recognised* and
// the login page can say "your session ended" instead of a bare sign-in form.

import { SignJWT, jwtVerify, errors, type JWTPayload } from 'jose';
import { authSecret, SESSION_HOURS, SESSION_IDLE_MINUTES, secureCookies, SESSION_COOKIE } from './config';
import type { Role, SessionUser } from '@/lib/auth-types';

const ISSUER = 'relay';
const AUDIENCE = 'relay-session';
/** Extra cookie lifetime after the absolute limit, only so "session expired" can be shown. */
const EXPIRED_NOTICE_GRACE_S = 12 * 3600;
/** Re-sign at most this often while active (keeps proxy work tiny). */
export const RENEW_AFTER_S = 60;

interface SessionClaims extends JWTPayload { name?: string; email?: string; role?: string; ats?: number }

export interface SessionLimits { idleSeconds: number; absoluteSeconds: number }

export const defaultLimits = (): SessionLimits => ({
  idleSeconds: Math.round(SESSION_IDLE_MINUTES * 60),
  absoluteSeconds: Math.round(SESSION_HOURS * 3600),
});

const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Signs a session. `authTime` (seconds) is when the person actually signed in;
 * pass it through unchanged when renewing so the absolute limit can't be extended.
 */
export async function signSession(
  user: SessionUser,
  opts: { authTime?: number; now?: number; limits?: SessionLimits } = {},
): Promise<string> {
  const now = opts.now ?? nowS();
  const ats = opts.authTime ?? now;
  const { idleSeconds, absoluteSeconds } = opts.limits ?? defaultLimits();
  const exp = Math.min(now + idleSeconds, ats + absoluteSeconds);
  return new SignJWT({ name: user.name, email: user.email, role: user.role, ats })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(authSecret());
}

export type SessionCheck =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'expired'; reason: 'idle' | 'absolute' }
  | { status: 'valid'; user: SessionUser; authTime: number; issuedAt: number };

function toUser(p: SessionClaims): SessionUser | null {
  if (!p.sub || (p.role !== 'ma' && p.role !== 'admin')) return null;
  return { id: p.sub, name: p.name ?? 'Staff', email: p.email, role: p.role as Role };
}

/** Full check, distinguishing "signed out", "tampered/garbage" and "expired (idle vs. absolute)". */
export async function checkSession(
  token: string | undefined,
  opts: { now?: number; limits?: SessionLimits } = {},
): Promise<SessionCheck> {
  if (!token) return { status: 'none' };
  const now = opts.now ?? nowS();
  const { absoluteSeconds } = opts.limits ?? defaultLimits();
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, authSecret(), {
      issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'], currentDate: new Date(now * 1000),
    });
    const user = toUser(payload);
    const ats = typeof payload.ats === 'number' ? payload.ats : payload.iat;
    if (!user || typeof ats !== 'number' || typeof payload.iat !== 'number') return { status: 'invalid' };
    // Belt and braces: enforce the absolute limit even if a token was minted with a long exp.
    if (now >= ats + absoluteSeconds) return { status: 'expired', reason: 'absolute' };
    return { status: 'valid', user, authTime: ats, issuedAt: payload.iat };
  } catch (err) {
    // jose checks the signature before the claims, so JWTExpired means "genuine but expired".
    if (err instanceof errors.JWTExpired) {
      const p = err.payload as SessionClaims;
      const ats = typeof p.ats === 'number' ? p.ats : p.iat;
      const reason = typeof ats === 'number' && now >= ats + absoluteSeconds ? 'absolute' : 'idle';
      return { status: 'expired', reason };
    }
    if (err instanceof Error && /AUTH_SECRET/.test(err.message)) throw err; // misconfiguration: fail loudly
    return { status: 'invalid' };
  }
}

/** Valid user or null (any other state). */
export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  const check = await checkSession(token);
  return check.status === 'valid' ? check.user : null;
}

/** True when an active session should be re-signed to slide its idle expiry forward. */
export function shouldRenew(check: SessionCheck, now = nowS()): check is Extract<SessionCheck, { status: 'valid' }> {
  return check.status === 'valid' && now - check.issuedAt >= RENEW_AFTER_S;
}

export function sessionCookieOptions(authTime = nowS(), now = nowS()) {
  const { absoluteSeconds } = defaultLimits();
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(60, authTime + absoluteSeconds - now + EXPIRED_NOTICE_GRACE_S),
  };
}

export { SESSION_COOKIE };
