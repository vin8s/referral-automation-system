// Staff login: redirect safety, session idle/absolute expiry, Cognito error mapping,
// the authorization URL, logout URLs and the login-screen states. No network.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as oidc from 'openid-client';
import { safeNext, DEFAULT_AFTER_LOGIN } from '@/server/auth/redirect';
import { checkSession, shouldRenew, signSession, RENEW_AFTER_S } from '@/server/auth/session';
import { mapAuthorizeError, mapCallbackException } from '@/server/auth/errors';
import { buildAuthorizationUrl, cognitoLogoutUrl, LOGOUT_RETURN_PATHS, roleFromGroups } from '@/server/auth/cognito';
import { resolveNotice, COPY } from '@/app/login/messages';
import type { SessionUser } from '@/lib/auth-types';

const ENV_KEYS = ['APP_URL', 'COGNITO_DOMAIN', 'COGNITO_CLIENT_ID', 'COGNITO_SCOPES', 'COGNITO_ADMIN_GROUP', 'COGNITO_MA_GROUP'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]])); });
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('safeNext (open-redirect protection)', () => {
  it.each([
    ['/referrals', '/referrals'],
    ['/referrals/abc?tab=sms#x', '/referrals/abc?tab=sms#x'],
    ['/confirm-queue?filter=pending', '/confirm-queue?filter=pending'],
  ])('keeps same-site path %s', (input, out) => expect(safeNext(input)).toBe(out));

  it.each([
    undefined, null, 42, '', 'referrals', 'https://evil.example', 'http://evil.example/x', '//evil.example',
    '///evil.example', '/\\evil.example', '/\\/evil.example', '\\\\evil.example', '/%0d%0a', '/\tevil', '/\n/evil.example',
    'javascript:alert(1)', '/login', '/login?next=/x', '/api/auth/logout', '/api/referrals', '/', 'x'.repeat(10),
    '/' + 'a'.repeat(3000),
  ])('rejects %j', input => {
    const out = safeNext(input);
    if (input === '/%0d%0a') expect(out).toBe('/%0d%0a'); // percent-encoded stays a harmless path
    else expect(out).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('never returns something a browser would treat as another origin', () => {
    for (const s of ['//a.b', '/\\a.b', '/\t/a.b', 'https:a.b', '/..//a.b']) {
      const out = safeNext(s);
      expect(new URL(out, 'https://relay.example.org').origin).toBe('https://relay.example.org');
    }
  });
});

describe('session idle + absolute expiry', () => {
  const user: SessionUser = { id: 'sub-1', name: 'Test MA', email: 'ma@example.test', role: 'ma' };
  const limits = { idleSeconds: 30 * 60, absoluteSeconds: 8 * 3600 };
  const t0 = 1_800_000_000;

  it('is valid right after sign-in', async () => {
    const tok = await signSession(user, { now: t0, limits });
    const c = await checkSession(tok, { now: t0 + 60, limits });
    expect(c.status).toBe('valid');
    if (c.status === 'valid') { expect(c.user).toEqual(user); expect(c.authTime).toBe(t0); }
  });

  it('expires after the idle window with reason "idle"', async () => {
    const tok = await signSession(user, { now: t0, limits });
    expect(await checkSession(tok, { now: t0 + 31 * 60, limits })).toEqual({ status: 'expired', reason: 'idle' });
  });

  it('activity (renewal) slides the idle window but never the absolute limit', async () => {
    let tok = await signSession(user, { now: t0, limits });
    let now = t0;
    // Active every 20 minutes for 9 hours.
    for (let i = 0; i < 27; i++) {
      now += 20 * 60;
      const c = await checkSession(tok, { now, limits });
      if (now < t0 + limits.absoluteSeconds) {
        expect(c.status).toBe('valid');
        if (c.status !== 'valid') return;
        expect(shouldRenew(c, now)).toBe(true);
        tok = await signSession(c.user, { authTime: c.authTime, now, limits });
      } else {
        expect(c).toEqual({ status: 'expired', reason: 'absolute' });
        return;
      }
    }
    throw new Error('absolute limit never hit');
  });

  it('does not renew more than once a minute', async () => {
    const tok = await signSession(user, { now: t0, limits });
    const c = await checkSession(tok, { now: t0 + 10, limits });
    expect(shouldRenew(c, t0 + 10)).toBe(false);
    expect(shouldRenew(c, t0 + RENEW_AFTER_S)).toBe(true);
  });

  it('rejects tampered, foreign and garbage tokens as invalid (not expired)', async () => {
    const tok = await signSession(user, { now: t0, limits });
    const [h, p, s] = tok.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'admin' })).toString('base64url');
    expect((await checkSession(`${h}.${forged}.${s}`, { now: t0, limits })).status).toBe('invalid');
    expect((await checkSession('not-a-jwt', { now: t0, limits })).status).toBe('invalid');
    expect((await checkSession(undefined, { now: t0, limits })).status).toBe('none');
  });
});

describe('Cognito error mapping', () => {
  it.each([
    ['access_denied', 'cancelled'], ['invalid_request', 'config'], ['unauthorized_client', 'config'],
    ['invalid_scope', 'config'], ['server_error', 'signin_failed'], ['login_required', 'attempt_expired'],
    [null, 'signin_failed'], ['something_new', 'signin_failed'],
  ])('callback ?error=%s → %s', (code, out) => expect(mapAuthorizeError(code)).toBe(out));

  it('maps openid-client exceptions', () => {
    expect(mapCallbackException({ code: 'OAUTH_RESPONSE_BODY_ERROR', error: 'invalid_grant' })).toBe('attempt_expired');
    expect(mapCallbackException({ code: 'OAUTH_AUTHORIZATION_RESPONSE_ERROR', error: 'access_denied' })).toBe('cancelled');
    expect(mapCallbackException({ code: 'OAUTH_INVALID_RESPONSE', message: 'unexpected "state" response parameter value' })).toBe('attempt_expired');
    expect(mapCallbackException({ code: 'OAUTH_JWT_CLAIM_COMPARISON_FAILED', message: 'unexpected ID Token "nonce" claim value' })).toBe('attempt_expired');
    // As openid-client actually throws it (generic message, detail on `cause`).
    expect(mapCallbackException({
      code: 'OAUTH_INVALID_RESPONSE', message: 'invalid response encountered',
      cause: { message: 'unexpected "state" response parameter value' },
    })).toBe('attempt_expired');
    expect(mapCallbackException({ code: 'OAUTH_INVALID_RESPONSE', message: 'invalid response encountered' })).toBe('signin_failed');
    expect(mapCallbackException(new TypeError('fetch failed'))).toBe('signin_failed');
    expect(mapCallbackException(null)).toBe('signin_failed');
  });

  it('maps groups to roles (admin wins; no group = no access)', () => {
    expect(roleFromGroups(['ma', 'admin'])).toBe('admin');
    expect(roleFromGroups(['ma'])).toBe('ma');
    expect(roleFromGroups(['other'])).toBeNull();
    expect(roleFromGroups(undefined)).toBeNull();
    expect(roleFromGroups('admin')).toBeNull();
  });
});

describe('authorization + logout URLs', () => {
  const server: oidc.ServerMetadata = {
    issuer: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TEST',
    authorization_endpoint: 'https://relay-test.auth.us-east-2.amazoncognito.com/oauth2/authorize',
    token_endpoint: 'https://relay-test.auth.us-east-2.amazoncognito.com/oauth2/token',
  };
  const config = new oidc.Configuration(server, 'client123', 'secret', oidc.ClientSecretPost('secret'));

  it('builds a managed-login URL with PKCE S256, state, nonce, scopes, prompt=login and lang', async () => {
    process.env.APP_URL = 'https://relay.example.org';
    const verifier = oidc.randomPKCECodeVerifier();
    const url = await buildAuthorizationUrl(config, { state: 'st', nonce: 'no', verifier, next: '/x', lang: 'es' });
    expect(url.origin + url.pathname).toBe(server.authorization_endpoint);
    const q = url.searchParams;
    expect(q.get('client_id')).toBe('client123');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('redirect_uri')).toBe('https://relay.example.org/api/auth/callback');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toBe(await oidc.calculatePKCECodeChallenge(verifier));
    expect(q.get('code_challenge')).not.toBe(verifier);
    expect(q.get('state')).toBe('st');
    expect(q.get('nonce')).toBe('no');
    expect(q.get('prompt')).toBe('login');
    expect(q.get('lang')).toBe('es');
    expect(q.has('client_secret')).toBe(false);
  });

  it('logout URL returns to an exactly-registered sign-out URL', () => {
    process.env.APP_URL = 'https://relay.example.org/';
    process.env.COGNITO_DOMAIN = 'https://relay-test.auth.us-east-2.amazoncognito.com';
    process.env.COGNITO_CLIENT_ID = 'client123';
    const u = new URL(cognitoLogoutUrl()!);
    expect(u.origin + u.pathname).toBe('https://relay-test.auth.us-east-2.amazoncognito.com/logout');
    expect(u.searchParams.get('client_id')).toBe('client123');
    expect(u.searchParams.get('logout_uri')).toBe('https://relay.example.org/login?signed_out=1');
    expect(new URL(cognitoLogoutUrl(LOGOUT_RETURN_PATHS.noRole)!).searchParams.get('logout_uri'))
      .toBe('https://relay.example.org/login?error=no_role');
    delete process.env.COGNITO_DOMAIN;
    expect(cognitoLogoutUrl()).toBeNull();
  });
});

describe('login screen states', () => {
  it('shows one notice with the right priority', () => {
    expect(resolveNotice({ error: 'no_role', signed_out: '1' }, 'en', true)?.error).toBe('config');
    expect(resolveNotice({ error: 'no_role', reason: 'idle' }, 'en', false)).toMatchObject({ tone: 'warn', error: 'no_role' });
    expect(resolveNotice({ error: 'cancelled' }, 'en', false)?.tone).toBe('info');
    expect(resolveNotice({ error: '<script>' }, 'en', false)?.error).toBe('signin_failed');
    expect(resolveNotice({ reason: 'idle' }, 'es', false)?.text).toBe(COPY.es.expiredIdle);
    expect(resolveNotice({ reason: 'absolute' }, 'en', false)?.text).toBe(COPY.en.expiredAbsolute);
    expect(resolveNotice({ signed_out: '1' }, 'en', false)).toEqual({ tone: 'info', text: COPY.en.signedOut });
    expect(resolveNotice({}, 'en', false)).toBeNull();
  });

  it('has Spanish text for every English message', () => {
    for (const k of Object.keys(COPY.en.errors) as (keyof typeof COPY.en.errors)[]) expect(COPY.es.errors[k]).toBeTruthy();
    expect(COPY.es.firstTimeSteps).toHaveLength(COPY.en.firstTimeSteps.length);
  });
});
