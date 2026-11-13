// POST /api/sms/inbound — PUBLIC webhook (listed in PUBLIC_PATHS in src/proxy.ts).
//
// AWS End User Messaging two-way SMS publishes inbound texts to an SNS topic; this
// endpoint is that topic's HTTPS subscription. It authenticates every request itself:
//   1. SNS signature verified against an AWS-hosted certificate (sns.<region>.amazonaws.com)
//   2. TopicArn must equal SMS_INBOUND_SNS_TOPIC_ARN
//   3. MessageId de-duped (SNS delivers at least once)
// Nothing about the request body is ever logged.

import { logError } from '@/server/log';
import { parseInboundPayload, parseSnsMessage, verifySnsMessage, isSnsUrl } from '@/server/sms/sns';
import { claimSnsMessage, receiveInboundSms, releaseSnsMessage } from '@/server/sms';

const MAX_BODY = 64 * 1024;

const reply = (status: number, error?: string) =>
  Response.json(error ? { error } : { ok: true }, { status });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(413, 'Too large');

  const msg = parseSnsMessage(raw);
  if (!msg) return reply(400, 'Not an SNS message');
  if (!(await verifySnsMessage(msg))) return reply(403, 'Invalid signature');

  const topic = process.env.SMS_INBOUND_SNS_TOPIC_ARN;
  if (!topic || msg.TopicArn !== topic) return reply(403, 'Unexpected topic');

  try {
    if (msg.Type === 'SubscriptionConfirmation') {
      if (!isSnsUrl(msg.SubscribeURL)) return reply(400, 'Bad SubscribeURL');
      const res = await fetch(msg.SubscribeURL!, { redirect: 'error' });
      return res.ok ? reply(200) : reply(502, 'Subscription confirmation failed');
    }
    if (msg.Type !== 'Notification') return reply(200); // UnsubscribeConfirmation etc.

    if (!(await claimSnsMessage(msg.MessageId))) return reply(200); // duplicate delivery
    const payload = parseInboundPayload(msg.Message);
    if (!payload) return reply(200); // not an inbound SMS payload; acknowledged so SNS doesn't retry

    try {
      await receiveInboundSms({
        from: payload.originationNumber,
        body: payload.messageBody,
        providerMessageId: payload.inboundMessageId ?? null,
      });
    } catch (err) {
      await releaseSnsMessage(msg.MessageId).catch(() => {}); // let SNS retry
      throw err;
    }
    return reply(200);
  } catch (err) {
    logError('POST /api/sms/inbound', err);
    return reply(500, 'Inbound processing failed');
  }
}
