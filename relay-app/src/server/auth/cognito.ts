// Amazon Cognito sign-in via standard OpenID Connect (authorization-code flow + PKCE,
// plus state and nonce), using `openid-client` (panva). Cognito's managed login pages
// handle the password, the forced first-time password change, authenticator-app (TOTP)
// enrollment and MFA codes, and "Forgot password". Relay only receives a verified
// ID token and turns it into its own short-lived session cookie; Cognito tokens are
// not stored.

import 'server-only';
import * as oidc from 'openid-client';
import { appUrl } from './config';
import type { Role, SessionUser } from '@/lib/auth-types';

const g = globalThis as unknown as { __relayOidc?: Promise<oidc.Configuration> };

/** A local http:// issuer (e.g. a fake OIDC server) is allowed in development only. */
function isDevLocalIssuer(issuer: URL): boolean {
  return process.env.NODE_ENV !== 'production' && issuer.protocol === 'http:'
    && (issuer.hostname === 'localhost' || issuer.hostname === '127.0.0.1');
}

function getConfig(): Promise<oidc.Configuration> {
  if (!g.__relayOidc) {
    const issuer = new URL(process.env.COGNITO_ISSUER!);
    const clientId = process.env.COGNITO_CLIENT_ID!;
    const secret = process.env.COGNITO_CLIENT_SECRET;
    g.__relayOidc = oidc
      .discovery(issuer, clientId, secret ? { client_secret: secret } : undefined,
        secret ? oidc.ClientSecretPost(secret) : oidc.None(),
        isDevLocalIssuer(issuer) ? { execute: [oidc.allowInsecureRequests] } : undefined)
      .catch(err => { g.__relayOidc = undefined; throw err; });
  }
  return g.__relayOidc;
}

export const redirectUri = () => `${appUrl()}/api/auth/callback`;

export type UiLang = 'en' | 'es';

export interface PendingLogin { state: string; nonce: string; verifier: string; next: string; lang?: UiLang }

/**
 * Builds the managed-login authorization URL. Split out (and exported) so tests can
 * check every parameter without a network discovery call.
 */
export async function buildAuthorizationUrl(config: oidc.Configuration, pending: PendingLogin): Promise<URL> {
  const params: Record<string, string> = {
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: process.env.COGNITO_SCOPES || 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(pending.verifier),
    code_challenge_method: 'S256',
    state: pending.state,
    nonce: pending.nonce,
    // Always ask for the password + authenticator code, even if the browser still has a
    // Cognito session cookie (up to 1 hour). Clinic computers are shared, so "Sign in"
    // must never silently continue someone else's session. Managed login only.
    prompt: 'login',
  };
  // Managed login is localized by `lang` (en, es, …); Cognito remembers it in a cookie.
  if (pending.lang) params.lang = pending.lang;
  return oidc.buildAuthorizationUrl(config, params);
}

export async function startLogin(next: string, lang?: UiLang): Promise<{ url: URL; pending: PendingLogin }> {
  const config = await getConfig();
  const pending: PendingLogin = {
    state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier(), next, lang,
  };
  return { url: await buildAuthorizationUrl(config, pending), pending };
}

/** Cognito groups → Relay role. Users in neither group get no access. */
export function roleFromGroups(groups: unknown): Role | null {
  const list = Array.isArray(groups) ? groups.filter((g): g is string => typeof g === 'string') : [];
  const adminGroup = process.env.COGNITO_ADMIN_GROUP || 'admin';
  const maGroup = process.env.COGNITO_MA_GROUP || 'ma';
  return list.includes(adminGroup) ? 'admin' : list.includes(maGroup) ? 'ma' : null;
}

/** Exchanges the code (PKCE), validates state, nonce and the ID token, and maps groups → role. */
export async function finishLogin(callbackSearch: string, pending: PendingLogin): Promise<SessionUser | 'no_role'> {
  const config = await getConfig();
  // Rebuild the callback URL from APP_URL so it matches the registered redirect URI
  // even behind a load balancer / CDN.
  const currentUrl = new URL(`${redirectUri()}${callbackSearch}`);
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: pending.verifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims()!;
  const role = roleFromGroups(claims['cognito:groups']);
  if (!role) return 'no_role';

  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const name =
    (typeof claims.name === 'string' && claims.name) ||
    [claims.given_name, claims.family_name].filter(v => typeof v === 'string').join(' ') ||
    email || 'Staff';
  return { id: claims.sub, name, email, role };
}

/**
 * Where Cognito may send people after its /logout endpoint. Each of these must be
 * registered EXACTLY as an "Allowed sign-out URL" on the app client (infra/ does this).
 */
export const LOGOUT_RETURN_PATHS = {
  signedOut: '/login?signed_out=1',
  noRole: '/login?error=no_role',
} as const;

/**
 * Cognito managed-login logout URL: clears the Cognito session cookie, then returns
 * to Relay. Null when COGNITO_DOMAIN isn't set (then Relay just shows /login).
 */
export function cognitoLogoutUrl(returnPath: string = LOGOUT_RETURN_PATHS.signedOut): string | null {
  const domain = process.env.COGNITO_DOMAIN;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!domain || !clientId) return null;
  const u = new URL('/logout', domain.startsWith('http') ? domain : `https://${domain}`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('logout_uri', `${appUrl()}${returnPath}`);
  return u.toString();
}
