// Outreach "tick": called by EventBridge Scheduler every few minutes during clinic
// hours. It POSTs to Relay's /api/sms/outreach/tick with the bearer token stored in
// Secrets Manager. Relay itself decides who (if anyone) to text right now.
// Logs only the HTTP status: never response bodies (they could contain patient data).
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});
let cachedToken;

async function token() {
  if (!cachedToken) {
    const out = await sm.send(new GetSecretValueCommand({ SecretId: process.env.TOKEN_SECRET_ARN }));
    cachedToken = out.SecretString;
  }
  return cachedToken;
}

export async function handler() {
  const res = await fetch(process.env.TICK_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(25_000),
  });
  console.log(JSON.stringify({ msg: 'outreach tick', status: res.status }));
  if (res.status === 401 || res.status === 403) cachedToken = undefined; // token rotated?
  if (!res.ok) throw new Error(`Outreach tick failed with HTTP ${res.status}`);
  return { status: res.status };
}
