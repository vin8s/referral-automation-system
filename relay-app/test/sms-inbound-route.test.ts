// POST /api/sms/inbound status codes. SNS retries any non-2xx (and timeouts), so the route
// must return 2xx for everything it has handled or deliberately ignored, and 5xx only when
// a retry can help. The SMS engine and signature check are mocked (no DB, no network).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { claim: [] as string[], release: [] as string[], receive: [] as unknown[] };
let claimResult = true;
let receiveImpl: () => Promise<unknown> = async () => ({ outcome: 'reply' });
let signatureOk = true;

vi.mock('@/server/sms', () => ({
  claimSnsMessage: async (id: string) => { calls.claim.push(id); return claimResult; },
  releaseSnsMessage: async (id: string) => { calls.release.push(id); },
  receiveInboundSms: async (input: unknown) => { calls.receive.push(input); return receiveImpl(); },
}));
vi.mock('@/server/sms/sns', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/sms/sns')>()),
  verifySnsMessage: async () => signatureOk,
}));

const { POST } = await import('@/app/api/sms/inbound/route');

const TOPIC = 'arn:aws:sns:us-east-1:000000000000:relay-inbound-sms-test';
const sns = (over: Record<string, unknown> = {}) => JSON.stringify({
  Type: 'Notification', MessageId: 'm-1', TopicArn: TOPIC, Timestamp: '2026-11-13T18:00:00Z',
  SignatureVersion: '2', Signature: 'x', SigningCertURL: 'https://sns.us-east-1.amazonaws.com/c.pem',
  Message: JSON.stringify({ originationNumber: '+14155550199', destinationNumber: '+15555550123', messageBody: 'hi', inboundMessageId: 'in-1' }),
  ...over,
});
const post = (body: string) => POST(new Request('http://localhost/api/sms/inbound', { method: 'POST', body }));

beforeEach(() => {
  calls.claim.length = 0; calls.release.length = 0; calls.receive.length = 0;
  claimResult = true; signatureOk = true; receiveImpl = async () => ({ outcome: 'reply' });
  process.env.SMS_INBOUND_SNS_TOPIC_ARN = TOPIC;
});

describe('POST /api/sms/inbound', () => {
  it('processes a notification once → 200', async () => {
    expect((await post(sns())).status).toBe(200);
    expect(calls.receive).toHaveLength(1);
  });

  it('a duplicate SNS delivery → 200 without processing again', async () => {
    claimResult = false;
    expect((await post(sns())).status).toBe(200);
    expect(calls.receive).toHaveLength(0);
  });

  it('malformed JSON → 400, bad signature → 403, wrong topic → 403 (none processed)', async () => {
    expect((await post('{not json')).status).toBe(400);
    expect((await post(JSON.stringify({ Type: 'Notification' }))).status).toBe(400);
    signatureOk = false;
    expect((await post(sns())).status).toBe(403);
    signatureOk = true;
    expect((await post(sns({ TopicArn: 'arn:aws:sns:us-east-1:000000000000:other' }))).status).toBe(403);
    expect(calls.receive).toHaveLength(0);
  });

  it('UnsubscribeConfirmation and non-SMS payloads are acknowledged (no retry storm)', async () => {
    expect((await post(sns({ Type: 'UnsubscribeConfirmation' }))).status).toBe(200);
    expect((await post(sns({ Message: 'not json' }))).status).toBe(200);
    expect((await post(sns({ Message: JSON.stringify({ originationNumber: '+14155550199' }) }))).status).toBe(200);
    expect(calls.receive).toHaveLength(0);
  });

  it('a SubscriptionConfirmation with a non-SNS SubscribeURL is refused', async () => {
    expect((await post(sns({ Type: 'SubscriptionConfirmation', SubscribeURL: 'https://evil.example/confirm' }))).status).toBe(400);
  });

  it('processing that could not store the text → 500 and the claim is released so SNS retries', async () => {
    receiveImpl = async () => { throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }); };
    expect((await post(sns())).status).toBe(500);
    expect(calls.release).toEqual(['m-1']);
  });

  it('an oversized body → 413', async () => {
    expect((await post('x'.repeat(70 * 1024))).status).toBe(413);
  });
});
