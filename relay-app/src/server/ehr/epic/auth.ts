// SMART Backend Services (client_credentials + private_key_jwt, RS384) for the Epic sandbox.
// Tokens last ~1 hour; we cache one and refresh a minute before expiry.

import { createPrivateKey, createSign, randomUUID } from 'node:crypto';
import { EhrError } from '../types';
import type { EpicConfig } from './config';

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** Signed client assertion JWT (Epic: iss = sub = client id, aud = token URL, exp ≤ 5 min). */
export function buildClientAssertion(cfg: EpicConfig, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = { alg: 'RS384', typ: 'JWT', kid: cfg.keyId };
  const claims = { iss: cfg.clientId, sub: cfg.clientId, aud: cfg.tokenUrl, jti: randomUUID(), iat: nowSec, nbf: nowSec, exp: nowSec + 240 };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA384').update(input).sign(createPrivateKey(cfg.privateKeyPem));
  return `${input}.${b64url(sig)}`;
}

type Fetch = typeof fetch;

export class EpicTokenSource {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly cfg: EpicConfig, private readonly fetchImpl: Fetch = fetch) {}

  async get(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token;
    this.inflight ??= this.fetchToken().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.cfg.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: buildClientAssertion(this.cfg),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new EhrError(`Could not reach Epic's token endpoint: ${err instanceof Error ? err.message : String(err)}`, 'network');
    }
    const body = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !body?.access_token) {
      const why = body?.error === 'invalid_client'
        ? 'Epic rejected the app (invalid_client). New or edited sandbox apps can take up to an hour to sync; also check EPIC_CLIENT_ID, EPIC_KEY_ID and the JWK Set URL.'
        : `Epic token request failed (HTTP ${res.status}${body?.error ? `, ${body.error}` : ''}).`;
      throw new EhrError(why, 'auth', res.status);
    }
    this.token = body.access_token;
    this.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    return this.token;
  }
}
