// POST /api/sms/twilio/inbound — PUBLIC webhook (listed in PUBLIC_PATHS in src/proxy.ts).
// TESTING ONLY, fake data only: there is no BAA with Twilio. Real patient texting uses
// AWS End User Messaging (/api/sms/inbound).
//
// Configure it in the Twilio console as the number's "A message comes in" webhook (HTTP POST),
// and set TWILIO_WEBHOOK_URL to exactly that URL (signatures are computed over it).
// Every request authenticates itself:
//   1. Refused unless SMS_PROVIDER=twilio and not production (404 otherwise)
//   2. X-Twilio-Signature verified with TWILIO_AUTH_TOKEN
//   3. AccountSid and To must match this Twilio account / number
//   4. From must be an approved test phone (TWILIO_TEST_ALLOWED_NUMBERS)
//   5. MessageSid de-duped (Twilio may retry)
// Nothing about the request body is ever logged.

import { logError } from '@/server/log';
import { smsProviderName, twilioForbidden, twilioAllowedNumbers, phoneKey } from '@/server/sms/provider';
import { verifyTwilioSignature } from '@/server/sms/twilio';
import { claimSnsMessage, receiveInboundSms, releaseSnsMessage } from '@/server/sms';

const MAX_BODY = 16 * 1024;
// Empty TwiML: Relay sends its own replies through the API, so Twilio should send nothing.
const twiml = (status = 200) =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status, headers: { 'Content-Type': 'text/xml' },
  });

export async function POST(req: Request) {
  if (smsProviderName() !== 'twilio' || twilioForbidden()) return new Response('Not found', { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response('Too large', { status: 413 });
  const params = Object.fromEntries(new URLSearchParams(raw));

  const url = process.env.TWILIO_WEBHOOK_URL ?? '';
  const token = process.env.TWILIO_AUTH_TOKEN ?? '';
  if (!verifyTwilioSignature(url, params, token, req.headers.get('x-twilio-signature'))) {
    return new Response('Invalid signature', { status: 403 });
  }
  if (params.AccountSid !== process.env.TWILIO_ACCOUNT_SID) return new Response('Unexpected account', { status: 403 });
  if (phoneKey(params.To ?? '') !== phoneKey(process.env.TWILIO_FROM_NUMBER ?? '')) {
    return new Response('Unexpected number', { status: 403 });
  }
  // Only approved test phones; anything else is acknowledged and dropped (fake data only).
  if (!twilioAllowedNumbers().has(phoneKey(params.From ?? ''))) return twiml();
  if (!params.MessageSid || typeof params.Body !== 'string') return new Response('Bad request', { status: 400 });

  const eventId = `twilio:${params.MessageSid}`;
  try {
    if (!(await claimSnsMessage(eventId))) return twiml(); // duplicate delivery
    try {
      await receiveInboundSms({ from: params.From, body: params.Body, providerMessageId: params.MessageSid, provider: 'twilio' });
    } catch (err) {
      await releaseSnsMessage(eventId).catch(() => {});
      throw err;
    }
    return twiml();
  } catch (err) {
    logError('POST /api/sms/twilio/inbound', err);
    return new Response('Inbound processing failed', { status: 500 });
  }
}
