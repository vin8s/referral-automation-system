// Amazon SNS HTTPS message verification (for AWS End User Messaging two-way SMS).
// https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
//
// Every message is checked before we trust a byte of it:
//   1. SigningCertURL / SubscribeURL must be https on an AWS SNS host (sns.<region>.amazonaws.com).
//   2. The signature (SignatureVersion 1 = SHA1, 2 = SHA256) must verify against that certificate.
//   3. The caller then checks TopicArn against SMS_INBOUND_SNS_TOPIC_ARN and de-dupes on MessageId.

import 'server-only';
import { createVerify } from 'node:crypto';

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation' | string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** True for https URLs on an SNS host (blocks attacker-hosted certificates and SSRF via SubscribeURL). */
export function isSnsUrl(raw: string | undefined, opts: { pem?: boolean } = {}): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !SNS_HOST.test(u.hostname) || u.port) return false;
    return opts.pem ? u.pathname.endsWith('.pem') : true;
  } catch {
    return false;
  }
}

/** The canonical string AWS signs (keys in this exact order, each "Key\nValue\n"). */
export function stringToSign(m: SnsMessage): string {
  const keys = m.Type === 'Notification'
    ? ['Message', 'MessageId', ...(m.Subject !== undefined ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return keys.map(k => `${k}\n${(m as unknown as Record<string, string>)[k] ?? ''}\n`).join('');
}

export type CertFetcher = (url: string) => Promise<string>;

const certCache = new Map<string, string>();

const defaultFetcher: CertFetcher = async url => {
  const hit = certCache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`cert fetch failed (${res.status})`);
  const pem = await res.text();
  if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('not a certificate');
  certCache.set(url, pem);
  return pem;
};

export function parseSnsMessage(body: string): SnsMessage | null {
  try {
    const m = JSON.parse(body) as SnsMessage;
    const required = ['Type', 'MessageId', 'TopicArn', 'Timestamp', 'SignatureVersion', 'Signature', 'SigningCertURL'] as const;
    if (!m || typeof m !== 'object' || required.some(k => typeof m[k] !== 'string')) return null;
    if (typeof m.Message !== 'string') return null;
    return m;
  } catch {
    return null;
  }
}

/** Verifies an SNS message signature. Never throws; returns false on any problem. */
export async function verifySnsMessage(m: SnsMessage, fetchCert: CertFetcher = defaultFetcher): Promise<boolean> {
  try {
    if (!isSnsUrl(m.SigningCertURL, { pem: true })) return false;
    if (m.SubscribeURL !== undefined && !isSnsUrl(m.SubscribeURL)) return false;
    const algo = m.SignatureVersion === '1' ? 'RSA-SHA1' : m.SignatureVersion === '2' ? 'RSA-SHA256' : null;
    if (!algo) return false;
    const cert = await fetchCert(m.SigningCertURL);
    const v = createVerify(algo);
    v.update(stringToSign(m), 'utf8');
    return v.verify(cert, m.Signature, 'base64');
  } catch {
    return false;
  }
}

/** Payload AWS End User Messaging (SMS v2) publishes for an inbound text. */
export interface InboundSmsPayload {
  originationNumber: string;   // patient
  destinationNumber: string;   // our number
  messageBody: string;
  inboundMessageId?: string;
  messageKeyword?: string;
}

export function parseInboundPayload(message: string): InboundSmsPayload | null {
  try {
    const p = JSON.parse(message) as InboundSmsPayload;
    if (typeof p?.originationNumber !== 'string' || typeof p?.messageBody !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}
