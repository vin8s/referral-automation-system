// Authorization helpers. src/proxy.ts does a fast first check, but every page
// layout and every route handler checks again here (defense in depth, as the
// Next.js data-security guide recommends).

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, checkSession, verifySession } from './session';
import { logError } from '../log';
import type { Role, SessionUser } from '@/lib/auth-types';

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** For Server Components / layouts: redirect to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const store = await cookies();
  const check = await checkSession(store.get(SESSION_COOKIE)?.value);
  if (check.status === 'valid') return check.user;
  redirect(check.status === 'expired' ? `/login?reason=${check.reason}` : '/login');
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/**
 * Wraps a route handler: 401 if signed out, 403 if the role isn't allowed,
 * 500 (without leaking details) if the handler throws.
 */
export function withAuth<Ctx>(
  handler: (req: Request, ctx: Ctx, user: SessionUser) => Promise<Response>,
  opts: { roles?: Role[]; name?: string } = {},
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    let user: SessionUser | null;
    try {
      user = await getSessionUser();
    } catch (err) {
      logError(`auth ${opts.name ?? new URL(req.url).pathname}`, err);
      return jsonError(500, 'Authentication is misconfigured on the server.');
    }
    if (!user) return Response.json({ error: 'Not signed in.', code: 'unauthenticated' }, { status: 401 });
    if (opts.roles && !opts.roles.includes(user.role)) {
      return jsonError(403, 'You do not have permission to do this.');
    }
    try {
      return await handler(req, ctx, user);
    } catch (err) {
      logError(`${req.method} ${opts.name ?? new URL(req.url).pathname}`, err);
      return jsonError(500, 'Something went wrong on the server.');
    }
  };
}

/** Parses a JSON body; returns null on malformed input. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
