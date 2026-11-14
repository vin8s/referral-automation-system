// CSRF: state-changing API requests from another site are refused by src/proxy.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isCrossSiteWrite } from '@/server/auth/csrf';
import { proxy } from '@/proxy';

const h = (o: Record<string, string>) => new Headers(o);

describe('isCrossSiteWrite', () => {
  afterEach(() => { delete process.env.APP_URL; });

  it('allows reads, same-origin writes and server-to-server calls (no Origin)', () => {
    expect(isCrossSiteWrite('GET', h({ origin: 'https://evil.example', host: 'relay.example.org' }))).toBe(false);
    expect(isCrossSiteWrite('POST', h({ origin: 'https://relay.example.org', host: 'relay.example.org' }))).toBe(false);
    expect(isCrossSiteWrite('POST', h({ host: 'relay.example.org' }))).toBe(false); // SNS / EventBridge
    expect(isCrossSiteWrite('PATCH', h({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(false);
  });

  it('refuses writes from another site, a sibling subdomain or an opaque origin', () => {
    expect(isCrossSiteWrite('POST', h({ origin: 'https://evil.example', host: 'relay.example.org' }))).toBe(true);
    expect(isCrossSiteWrite('PUT', h({ origin: 'https://blog.example.org', host: 'relay.example.org' }))).toBe(true);
    expect(isCrossSiteWrite('DELETE', h({ origin: 'null', host: 'relay.example.org' }))).toBe(true);
    expect(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'cross-site', host: 'relay.example.org' }))).toBe(true);
  });

  it('accepts the APP_URL host when a proxy rewrites Host', () => {
    process.env.APP_URL = 'https://relay.example.org';
    expect(isCrossSiteWrite('POST', h({ origin: 'https://relay.example.org', host: 'internal-alb.local' }))).toBe(false);
  });
});

describe('proxy CSRF gate', () => {
  it('blocks a cross-site POST to a signed-in API route and to logout, before auth', async () => {
    for (const path of ['/api/referrals/REF-1/confirm', '/api/auth/logout', '/api/sms/settings']) {
      const res = await proxy(new NextRequest(`http://relay.example.org${path}`, {
        method: 'POST', headers: { origin: 'https://evil.example', host: 'relay.example.org' },
      }));
      expect(res.status).toBe(403);
    }
  });

  it('lets a webhook POST (no Origin) through to its own authentication', async () => {
    const res = await proxy(new NextRequest('http://relay.example.org/api/sms/inbound', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(200); // NextResponse.next()
  });
});
