// AWS provider: RCS agent origination → SendRcsMessage; phone/pool origination → SendTextMessage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { name: string; input: Record<string, unknown> }[] = [];
vi.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => {
  class Cmd { constructor(public input: Record<string, unknown>) {} }
  class SendRcsMessageCommand extends Cmd {}
  class SendTextMessageCommand extends Cmd {}
  class PinpointSMSVoiceV2Client {
    async send(cmd: Cmd) {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      return { MessageId: 'msg-1' };
    }
  }
  return { PinpointSMSVoiceV2Client, SendRcsMessageCommand, SendTextMessageCommand };
});

import { AwsSmsProvider, isRcsOrigination } from '@/server/sms/provider';

describe('AWS provider channel selection', () => {
  beforeEach(() => { sent.length = 0; vi.stubEnv('AWS_REGION', 'us-east-2'); });
  afterEach(() => vi.unstubAllEnvs());

  it('detects RCS agents and the SMS_CHANNEL override', () => {
    expect(isRcsOrigination('rcs-5e9b887f')).toBe(true);
    expect(isRcsOrigination('phone-123')).toBe(false);
    vi.stubEnv('SMS_CHANNEL', 'rcs');
    expect(isRcsOrigination('pool-abc')).toBe(true);
  });

  it('sends through SendRcsMessage for an RCS agent', async () => {
    vi.stubEnv('SMS_ORIGINATION_IDENTITY', 'rcs-abc');
    const res = await new AwsSmsProvider().send({ to: '(555) 010-0001', body: 'Hello' });
    expect(res).toEqual({ providerMessageId: 'msg-1', status: 'sent' });
    expect(sent[0].name).toBe('SendRcsMessageCommand');
    expect(sent[0].input).toMatchObject({
      DestinationPhoneNumber: '+15550100001', OriginationIdentity: 'rcs-abc',
      RcsMessageContent: { Content: { TextMessage: { Body: 'Hello' } } }, MessageTrafficType: 'TRANSACTIONAL',
    });
  });

  it('keeps SendTextMessage for phone numbers', async () => {
    vi.stubEnv('SMS_ORIGINATION_IDENTITY', 'phone-abc');
    await new AwsSmsProvider().send({ to: '5550100001', body: 'Hi' });
    expect(sent[0].name).toBe('SendTextMessageCommand');
    expect(sent[0].input).toMatchObject({ OriginationIdentity: 'phone-abc', MessageBody: 'Hi' });
  });
});
