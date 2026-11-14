// Twilio webhook authentication (TESTING ONLY — see TwilioTestSmsProvider in ./provider).
//
// Twilio signs every webhook with X-Twilio-Signature:
//   base64( HMAC-SHA1( authToken, fullUrl + concat(sortedKeys.map(k => k + value)) ) )
// where fullUrl is exactly the URL configured in the Twilio console (scheme, host, path, query).
// https://www.twilio.com/docs/usage/webhooks/webhooks-security

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function verifyTwilioSignature(
  url: string, params: Record<string, string>, authToken: string, signature: string | null,
): boolean {
  if (!signature || !authToken || !url) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
