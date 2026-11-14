// Open-redirect protection for the `next` parameter (where to go after sign-in).
// Pure: no 'server-only', so src/proxy.ts and the tests can use it.

export const DEFAULT_AFTER_LOGIN = '/dashboard';

const BASE = 'http://relay.invalid';
// Control characters (incl. tab/newline, which browsers strip from URLs) and backslashes
// (which browsers treat like "/", so "/\evil.com" means "//evil.com").
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

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
