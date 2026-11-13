// Amazon Cognito sign-in via standard OpenID Connect (authorization-code flow + PKCE),
// using `openid-client` (panva). Cognito's hosted UI handles passwords and MFA;
// Relay only receives a verified ID token and turns it into its own session cookie.

import 'server-only';
import * as oidc from 'openid-client';
import { appUrl } from './config';
import type { Role, SessionUser } from '@/lib/auth-types';

const g = globalThis as unknown as { __relayOidc?: Promise<oidc.Configuration> };

function getConfig(): Promise<oidc.Configuration> {
  if (!g.__relayOidc) {
    const issuer = process.env.COGNITO_ISSUER!;
    const clientId = process.env.COGNITO_CLIENT_ID!;
    const secret = process.env.COGNITO_CLIENT_SECRET;
    g.__relayOidc = oidc
      .discovery(new URL(issuer), clientId, secret ? { client_secret: secret } : undefined,
        secret ? oidc.ClientSecretPost(secret) : oidc.None())
      .catch(err => { g.__relayOidc = undefined; throw err; });
  }
  return g.__relayOidc;
}

export const redirectUri = () => `${appUrl()}/api/auth/callback`;

export interface PendingLogin { state: string; nonce: string; verifier: string; next: string }

export async function startLogin(next: string): Promise<{ url: URL; pending: PendingLogin }> {
  const config = await getConfig();
  const verifier = oidc.randomPKCECodeVerifier();
  const pending: PendingLogin = { state: oidc.randomState(), nonce: oidc.randomNonce(), verifier, next };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: process.env.COGNITO_SCOPES || 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state: pending.state,
    nonce: pending.nonce,
  });
  return { url, pending };
}

/** Exchanges the code, validates the ID token, and maps Cognito groups → Relay role. */
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
  const groups = (claims['cognito:groups'] as string[] | undefined) ?? [];
  const adminGroup = process.env.COGNITO_ADMIN_GROUP || 'admin';
  const maGroup = process.env.COGNITO_MA_GROUP || 'ma';
  const role: Role | null = groups.includes(adminGroup) ? 'admin' : groups.includes(maGroup) ? 'ma' : null;
  if (!role) return 'no_role';

  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const name =
    (typeof claims.name === 'string' && claims.name) ||
    [claims.given_name, claims.family_name].filter(v => typeof v === 'string').join(' ') ||
    email || 'Staff';
  return { id: claims.sub, name, email, role };
}

/** Cognito hosted-UI logout URL (needs COGNITO_DOMAIN), or null to just go to /login. */
export function cognitoLogoutUrl(): string | null {
  const domain = process.env.COGNITO_DOMAIN;
  if (!domain) return null;
  const u = new URL('/logout', domain.startsWith('http') ? domain : `https://${domain}`);
  u.searchParams.set('client_id', process.env.COGNITO_CLIENT_ID!);
  u.searchParams.set('logout_uri', `${appUrl()}/login`);
  return u.toString();
}
