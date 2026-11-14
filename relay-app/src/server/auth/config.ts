// Auth configuration, read purely from environment variables (see .env.example).
// No 'server-only' import because src/proxy.ts uses it too; nothing here is secret
// unless the env var is set, and non-NEXT_PUBLIC env vars never reach the browser.

export type AuthMode = 'mock' | 'cognito';

const isProd = () => process.env.NODE_ENV === 'production';

export function cognitoConfigured(): boolean {
  return Boolean(process.env.COGNITO_ISSUER && process.env.COGNITO_CLIENT_ID);
}

/**
 * 'cognito' when COGNITO_* vars are set (or AUTH_MODE=cognito).
 * 'mock' only in development. Mock mode can never be active with NODE_ENV=production:
 * asking for it there throws, so every protected request fails closed.
 */
export function authMode(): AuthMode {
  const explicit = process.env.AUTH_MODE?.toLowerCase();
  if (explicit === 'cognito') return 'cognito';
  if (explicit === 'mock' || !cognitoConfigured()) {
    if (isProd()) {
      throw new Error('Auth misconfigured: mock login is disabled in production. Set COGNITO_ISSUER, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_DOMAIN and AUTH_SECRET.');
    }
    return 'mock';
  }
  return 'cognito';
}

const DEV_FALLBACK_SECRET = 'relay-dev-only-secret-do-not-use-in-production-0123456789';

/** Key used to sign session cookies. Required (32+ chars) in production. */
export function authSecret(): Uint8Array {
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (isProd()) throw new Error('AUTH_SECRET must be set to at least 32 random characters in production.');
    secret = DEV_FALLBACK_SECRET;
  }
  return new TextEncoder().encode(secret);
}

/** Public base URL of the app, used to build the OIDC redirect URI. */
export function appUrl(): string {
  const url = process.env.APP_URL || (isProd() ? '' : 'http://localhost:3000');
  if (!url) throw new Error('APP_URL must be set in production (e.g. https://relay.example.org).');
  return url.replace(/\/$/, '');
}

export const SESSION_COOKIE = 'relay_session';
export const OIDC_COOKIE = 'relay_oidc';

function positiveNumber(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Absolute limit: a sign-in never lasts longer than this, however active (one shift). Default 8 h. */
export const SESSION_HOURS = positiveNumber(process.env.SESSION_HOURS, 8, 24);
/** Idle limit: signed out after this many minutes without activity. Default 30 min. */
export const SESSION_IDLE_MINUTES = positiveNumber(process.env.SESSION_IDLE_MINUTES, 30, SESSION_HOURS * 60);
export const secureCookies = () => isProd();

/** Clinic name shown on the sign-in screen. */
export function clinicLoginName(): string {
  return process.env.CLINIC_LOGIN_NAME?.trim() || 'Clinica Esperanza / Hope Clinic';
}
