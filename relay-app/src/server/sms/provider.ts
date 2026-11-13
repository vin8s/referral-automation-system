// SMS provider adapters behind one interface (swap via SMS_PROVIDER=mock|aws).
//
//   mock (default): no network. The engine still records every outbound text in
//                   the messages table, so the UI and the patient simulator work.
//   aws:            AWS End User Messaging SMS (pinpoint-sms-voice-v2 SendTextMessage).
//                   Needs AWS credentials from the environment / instance role,
//                   AWS_REGION, SMS_ORIGINATION_IDENTITY and optionally SMS_CONFIGURATION_SET.

import 'server-only';
import { randomUUID } from 'node:crypto';

export interface SendResult {
  providerMessageId: string;
  status: 'sent' | 'delivered';
}

export interface SmsProvider {
  readonly name: 'mock' | 'aws';
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

export function smsProviderName(): 'mock' | 'aws' {
  return process.env.SMS_PROVIDER?.toLowerCase() === 'aws' ? 'aws' : 'mock';
}

const g = globalThis as unknown as { __relaySmsProvider?: SmsProvider };

export function getSmsProvider(): SmsProvider {
  const want = smsProviderName();
  if (!g.__relaySmsProvider || g.__relaySmsProvider.name !== want) {
    g.__relaySmsProvider = want === 'aws' ? new AwsSmsProvider() : new MockSmsProvider();
  }
  return g.__relaySmsProvider;
}
