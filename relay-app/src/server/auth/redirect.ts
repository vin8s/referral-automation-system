// Open-redirect protection for the `next` parameter (where to go after sign-in).
// Pure: no 'server-only', so src/proxy.ts and the tests can use it.

export const DEFAULT_AFTER_LOGIN = '/dashboard';

const BASE = 'http://relay.invalid';
// Control characters (incl. tab/newline, which browsers strip from URLs) and backslashes
// (which browsers treat like "/", so "/\evil.com" means "//evil.com").
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * Where a signed-out request for a page goes (owner decision 2026-11-27, "option 8").
 *  - Cognito, no session: straight to the clinic sign-in page (/api/auth/login starts it),
 *    so staff never see an extra Relay screen before typing their password.
 *  - Expired session, mock login, or sign-in not set up: Relay's /login page, which explains
 *    what happened ("signed out after inactivity", the test-user picker, a setup problem).
 * `next` is the page they asked for; it is checked again by safeNext() after sign-in.
 */
export function signedOutDestination(opts: {
  cognito: boolean; next: string | null; expired: 'idle' | 'absolute' | null;
}): string {
  const p = new URLSearchParams();
  if (opts.next && opts.next !== '/') p.set('next', opts.next);
  if (opts.cognito && !opts.expired) {
    const s = p.toString();
    return `/api/auth/login${s ? `?${s}` : ''}`;
  }
  if (opts.expired) p.set('reason', opts.expired);
  const s = p.toString();
  return `/login${s ? `?${s}` : ''}`;
}

/**
 * Returns a same-site relative path that is safe to redirect to after sign-in,
 * or DEFAULT_AFTER_LOGIN. Rejects absolute URLs, protocol-relative URLs ("//x"),
 * backslash tricks, control characters, and the auth pages themselves (loops).
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith('/') || next.startsWith('//') || UNSAFE_CHARS.test(next)) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;
  const path = url.pathname;
  // Dot-segments can normalize into a protocol-relative URL ("/..//evil" → "//evil").
  if (path.startsWith('//')) return DEFAULT_AFTER_LOGIN;
  if (path === '/' || path === '/login' || path.startsWith('/login/') || path.startsWith('/api/')) {
    return DEFAULT_AFTER_LOGIN;
  }
  return path + url.search + url.hash;
}
