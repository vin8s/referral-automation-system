// SMS provider adapters behind one interface (swap via SMS_PROVIDER=mock|aws|twilio).
//
//   mock (default): no network. The engine still records every outbound text in
//                   the messages table, so the UI and the patient simulator work.
//   aws:            AWS End User Messaging SMS (pinpoint-sms-voice-v2 SendTextMessage).
//                   Needs AWS credentials from the environment / instance role,
//                   AWS_REGION, SMS_ORIGINATION_IDENTITY and optionally SMS_CONFIGURATION_SET.
//   twilio:         TESTING ONLY, fake data only (no BAA with Twilio). Refuses to run when
//                   NODE_ENV=production and only texts numbers in TWILIO_TEST_ALLOWED_NUMBERS.
//                   Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.

import 'server-only';
import { randomUUID } from 'node:crypto';

export interface SendResult {
  providerMessageId: string;
  status: 'sent' | 'delivered';
}

export type SmsProviderName = 'mock' | 'aws' | 'twilio';

export interface SmsProvider {
  readonly name: SmsProviderName;
  send(input: { to: string; body: string }): Promise<SendResult>;
}

/** US numbers → E.164 (+1XXXXXXXXXX). Other inputs are returned with only + and digits. */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`;
}

/** Last 10 digits, used to match inbound numbers to patients. */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock' as const;
  async send(): Promise<SendResult> {
    return { providerMessageId: `mock-${randomUUID()}`, status: 'delivered' };
  }
}

export class AwsSmsProvider implements SmsProvider {
  readonly name = 'aws' as const;
  private client: Promise<import('@aws-sdk/client-pinpoint-sms-voice-v2').PinpointSMSVoiceV2Client> | null = null;

  private getClient() {
    if (!this.client) {
      this.client = import('@aws-sdk/client-pinpoint-sms-voice-v2').then(
        ({ PinpointSMSVoiceV2Client }) => new PinpointSMSVoiceV2Client({ region: process.env.AWS_REGION }),
      );
    }
    return this.client;
  }

  async send({ to, body }: { to: string; body: string }): Promise<SendResult> {
    const origination = process.env.SMS_ORIGINATION_IDENTITY;
    if (!origination) throw new Error('SMS_ORIGINATION_IDENTITY is not set');
    const { SendTextMessageCommand } = await import('@aws-sdk/client-pinpoint-sms-voice-v2');
    const client = await this.getClient();
    const res = await client.send(new SendTextMessageCommand({
      DestinationPhoneNumber: toE164(to),
      OriginationIdentity: origination,
      MessageBody: body,
      MessageType: 'TRANSACTIONAL',
      ...(process.env.SMS_CONFIGURATION_SET ? { ConfigurationSetName: process.env.SMS_CONFIGURATION_SET } : {}),
    }));
    if (!res.MessageId) throw new Error('SendTextMessage returned no MessageId');
    return { providerMessageId: res.MessageId, status: 'sent' };
  }
}

/** True when Twilio test mode must be refused (production builds / NODE_ENV=production). */
export function twilioForbidden(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** TWILIO_TEST_ALLOWED_NUMBERS (comma separated) → set of 10-digit keys. */
export function twilioAllowedNumbers(): Set<string> {
  return new Set(
    (process.env.TWILIO_TEST_ALLOWED_NUMBERS ?? '')
      .split(/[,;\n]+/).map(n => phoneKey(n)).filter(k => k.length === 10),
  );
}

export class TwilioTestSmsProvider implements SmsProvider {
  readonly name = 'twilio' as const;

  async send({ to, body }: { to: string; body: string }): Promise<SendResult> {
    if (twilioForbidden()) throw Object.assign(new Error('Twilio test mode is disabled in production'), { name: 'TwilioForbidden' });
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) throw Object.assign(new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not set'), { name: 'TwilioNotConfigured' });
    // Guardrail: fake data only, so only explicitly approved test phones may ever receive a text.
    if (!twilioAllowedNumbers().has(phoneKey(to))) {
      throw Object.assign(new Error('Destination not in TWILIO_TEST_ALLOWED_NUMBERS'), { name: 'TwilioNotAllowed' });
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toE164(to), From: toE164(from), Body: body }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number };
    if (!res.ok || !data.sid) {
      // Only Twilio's numeric error code is kept (e.g. 30034 = number not registered); never the body.
      throw Object.assign(new Error(`Twilio send failed (HTTP ${res.status}, code ${data.code ?? 'n/a'})`), { name: `Twilio${data.code ?? res.status}` });
    }
    return { providerMessageId: data.sid, status: 'sent' };
  }
}

export function smsProviderName(): SmsProviderName {
  const v = process.env.SMS_PROVIDER?.toLowerCase();
  if (v === 'aws') return 'aws';
  if (v === 'twilio') return 'twilio';
  return 'mock';
}

const g = globalThis as unknown as { __relaySmsProvider?: SmsProvider };

export function getSmsProvider(): SmsProvider {
  const want = smsProviderName();
  if (want === 'twilio' && twilioForbidden()) {
    throw new Error('SMS_PROVIDER=twilio is for local testing only and is refused in production (no BAA with Twilio).');
  }
  if (!g.__relaySmsProvider || g.__relaySmsProvider.name !== want) {
    g.__relaySmsProvider = want === 'aws' ? new AwsSmsProvider() : want === 'twilio' ? new TwilioTestSmsProvider() : new MockSmsProvider();
  }
  return g.__relaySmsProvider;
}
