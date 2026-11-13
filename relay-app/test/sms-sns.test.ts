// SNS signature verification with a locally generated key pair (fixture; no network).
import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isSnsUrl, parseInboundPayload, parseSnsMessage, stringToSign, verifySnsMessage, type SnsMessage } from '@/server/sms/sns';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const CERT_URL = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0000000000000000000000.pem';
const TOPIC = 'arn:aws:sns:us-east-1:123456789012:relay-inbound-sms';

function signed(m: Omit<SnsMessage, 'Signature' | 'SignatureVersion' | 'SigningCertURL'>, version: '1' | '2' = '2'): SnsMessage {
  const msg = { ...m, SignatureVersion: version, SigningCertURL: CERT_URL, Signature: '' } as SnsMessage;
  const s = createSign(version === '1' ? 'RSA-SHA1' : 'RSA-SHA256');
  s.update(stringToSign(msg), 'utf8');
  msg.Signature = s.sign(privateKey, 'base64');
  return msg;
}

const notification = () => signed({
  Type: 'Notification',
  MessageId: 'b5f9a7d4-0000-4000-8000-000000000001',
  TopicArn: TOPIC,
  Timestamp: '2026-11-13T22:00:00.000Z',
  Message: JSON.stringify({
    originationNumber: '+14155550108', destinationNumber: '+15555550123', messageKeyword: 'KEYWORD_X',
    messageBody: '03/04/1980', inboundMessageId: 'in-0001', previousPublishedMessageId: 'out-0001',
  }),
});

const fetchCert = async (url: string) => {
  if (url !== CERT_URL) throw new Error('unexpected cert url');
  return PUBLIC_PEM;
};

describe('SNS signature verification', () => {
  it('accepts a correctly signed notification (SignatureVersion 2 and 1)', async () => {
    expect(await verifySnsMessage(notification(), fetchCert)).toBe(true);
    const v1 = signed({ Type: 'Notification', MessageId: 'm1', TopicArn: TOPIC, Timestamp: 't', Message: 'hi' }, '1');
    expect(await verifySnsMessage(v1, fetchCert)).toBe(true);
  });

  it('accepts a signed SubscriptionConfirmation', async () => {
    const m = signed({
      Type: 'SubscriptionConfirmation', MessageId: 'm2', TopicArn: TOPIC, Timestamp: 't', Message: 'confirm',
      Token: 'tok', SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
    });
    expect(await verifySnsMessage(m, fetchCert)).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const m = notification();
    m.Message = m.Message.replace('03/04/1980', '01/01/1990');
    expect(await verifySnsMessage(m, fetchCert)).toBe(false);
  });

  it('rejects a changed TopicArn (signature covers it)', async () => {
    const m = notification();
    m.TopicArn = 'arn:aws:sns:us-east-1:999999999999:attacker';
    expect(await verifySnsMessage(m, fetchCert)).toBe(false);
  });

  it('rejects a bad signature', async () => {
    const m = notification();
    m.Signature = Buffer.from('not a signature').toString('base64');
    expect(await verifySnsMessage(m, fetchCert)).toBe(false);
  });

  it('never fetches a certificate from a non-SNS host', async () => {
    let fetched = false;
    const m = { ...notification(), SigningCertURL: 'https://evil.example.com/cert.pem' };
    expect(await verifySnsMessage(m, async () => { fetched = true; return PUBLIC_PEM; })).toBe(false);
    expect(fetched).toBe(false);
  });

  it('rejects unknown signature versions', async () => {
    expect(await verifySnsMessage({ ...notification(), SignatureVersion: '3' }, fetchCert)).toBe(false);
  });
});

describe('SNS URL + payload parsing', () => {
  it.each([
    ['https://sns.us-east-1.amazonaws.com/x.pem', true],
    ['https://sns.cn-north-1.amazonaws.com.cn/x.pem', true],
    ['http://sns.us-east-1.amazonaws.com/x.pem', false],
    ['https://sns.us-east-1.amazonaws.com.evil.com/x.pem', false],
    ['https://evilsns.us-east-1.amazonaws.com/x.pem', false],
    ['https://sns.us-east-1.amazonaws.com:8443/x.pem', false],
    ['https://sns.us-east-1.amazonaws.com/x.txt', false],
  ])('%s → %s', (url, ok) => expect(isSnsUrl(url, { pem: true })).toBe(ok));

  it('parses the End User Messaging inbound payload', () => {
    const m = parseSnsMessage(JSON.stringify(notification()))!;
    expect(parseInboundPayload(m.Message)).toMatchObject({ originationNumber: '+14155550108', messageBody: '03/04/1980', inboundMessageId: 'in-0001' });
    expect(parseSnsMessage('{"Type":"Notification"}')).toBeNull();
    expect(parseSnsMessage('nope')).toBeNull();
  });
});
