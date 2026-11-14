// Cross-site request forgery check for state-changing API requests.
// Pure: no 'server-only', because src/proxy.ts uses it (and tests do).
//
// The session cookie is SameSite=Lax, which already stops most cross-site POSTs.
// This is the second layer: a browser always sends Origin (and Sec-Fetch-Site) on a
// POST/PUT/PATCH/DELETE, so a write whose Origin is another site is refused — that
// also covers sibling subdomains, which SameSite treats as "same site".
// Server-to-server callers (SNS, Twilio, EventBridge Scheduler) send neither header
// and are unaffected; they authenticate themselves.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type HeaderGetter = { get(name: string): string | null };

/** True when a browser sent a state-changing request from a different origin. */
export function isCrossSiteWrite(method: string, headers: HeaderGetter): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = headers.get('origin');
  if (!origin) return false;
  if (origin === 'null') return true; // sandboxed iframe / data: URL / opaque origin
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase();
  if (host) allowed.add(host);
  // The public URL too, in case a proxy in front rewrites the Host header.
  try { if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).host.toLowerCase()); } catch { /* ignore */ }
  return !allowed.has(originHost);
}
