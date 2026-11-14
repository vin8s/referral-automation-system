// Twilio test-mode provider: signature verification and guardrails (no network).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { twilioSignature, verifyTwilioSignature } from '@/server/sms/twilio';
import { TwilioTestSmsProvider, getSmsProvider, twilioAllowedNumbers } from '@/server/sms/provider';

// Example from Twilio's webhook-security documentation.
const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const TOKEN = '12345';
const PARAMS = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };

describe('Twilio webhook signature', () => {
  it('matches the documented example', () => {
    expect(twilioSignature(URL, PARAMS, TOKEN)).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });
  it('accepts a valid signature and rejects tampering', () => {
    const sig = twilioSignature(URL, PARAMS, TOKEN);
    expect(verifyTwilioSignature(URL, PARAMS, TOKEN, sig)).toBe(true);
    expect(verifyTwilioSignature(URL, { ...PARAMS, Digits: '9999' }, TOKEN, sig)).toBe(false);
    expect(verifyTwilioSignature('https://evil.example/myapp.php?foo=1&bar=2', PARAMS, TOKEN, sig)).toBe(false);
    expect(verifyTwilioSignature(URL, PARAMS, 'wrong-token', sig)).toBe(false);
    expect(verifyTwilioSignature(URL, PARAMS, TOKEN, null)).toBe(false);
  });
});

describe('Twilio test provider guardrails', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const configure = () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15550100000');
    vi.stubEnv('TWILIO_TEST_ALLOWED_NUMBERS', '(555) 010-0001, +15550100002');
  };

  it('parses the allow-list into 10-digit keys', () => {
    configure();
    expect([...twilioAllowedNumbers()].sort()).toEqual(['5550100001', '5550100002']);
  });

  it('refuses numbers that are not on the allow-list (no network call)', async () => {
    configure();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(new TwilioTestSmsProvider().send({ to: '+15550109999', body: 'hi' })).rejects.toMatchObject({ name: 'TwilioNotAllowed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends to an allowed number via the Twilio Messages API', async () => {
    configure();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = await new TwilioTestSmsProvider().send({ to: '555-010-0001', body: 'hello' });
    expect(res).toEqual({ providerMessageId: 'SM123', status: 'sent' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json');
    expect(String(init.body)).toContain('To=%2B15550100001');
  });

  it('keeps only the Twilio error code on failure', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 30034, message: 'unregistered' }), { status: 400 })));
    await expect(new TwilioTestSmsProvider().send({ to: '5550100001', body: 'x' })).rejects.toMatchObject({ name: 'Twilio30034' });
  });

  it('is refused in production', async () => {
    configure();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    expect(() => getSmsProvider()).toThrow(/refused in production/);
    await expect(new TwilioTestSmsProvider().send({ to: '5550100001', body: 'x' })).rejects.toMatchObject({ name: 'TwilioForbidden' });
  });
});
