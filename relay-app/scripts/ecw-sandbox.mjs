#!/usr/bin/env node
// eCW FHIR sandbox helper (SMART Backend Services, private_key_jwt).
// No dependencies: uses Node's built-in crypto and fetch.
//
//   node scripts/ecw-sandbox.mjs keys                 make the key pair + jwks.json (once)
//   node scripts/ecw-sandbox.mjs assertion <clientId> print a signed client_assertion (for Postman)
//   node scripts/ecw-sandbox.mjs token <clientId> [scopes]   request an access token from the sandbox
//   node scripts/ecw-sandbox.mjs get <clientId> <fhirUrl> [--async]   GET a FHIR URL with a fresh token
//
// The PRIVATE key is written to docs/private/ (git-ignored). Never commit, email or paste it.
// jwks.json holds only the PUBLIC key; it must be hosted at a public URL (the app's JWKS URL).
// Sandbox only: fake data. Do not point this at a real clinic until the BAA is signed.

import { generateKeyPairSync, createPrivateKey, createSign, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'docs', 'private', 'ecw-sandbox');
const PRIV = join(DIR, 'private-key.pem');
const JWKS = join(DIR, 'jwks.json');
const TOKEN_URL = 'https://staging-oauthserver.ecwcloud.com/oauth/oauth2/token';
const DEFAULT_SCOPES = 'system/Group.read system/Patient.read';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function keys() {
  if (existsSync(PRIV)) {
    console.log(`Key already exists at ${PRIV} (not overwriting).\njwks.json: ${JWKS}`);
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomUUID();
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS384', use: 'sig', key_ops: ['verify'] };
  writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(join(DIR, 'kid.txt'), kid + '\n');
  writeFileSync(JWKS, JSON.stringify({ keys: [jwk] }, null, 2) + '\n');
  console.log(`Created:\n  private key (SECRET): ${PRIV}\n  public jwks.json:     ${JWKS}\n  key id (kid):         ${kid}`);
  console.log('\nNext: host jwks.json at a public URL and use that URL as the app\'s JWKS URL.');
}

function assertion(clientId) {
  if (!clientId) throw new Error('Pass your Client Id (from the app\'s Sandbox Configuration tab).');
  if (!existsSync(PRIV)) throw new Error('No key yet. Run: node scripts/ecw-sandbox.mjs keys');
  const kid = readFileSync(join(DIR, 'kid.txt'), 'utf8').trim();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS384', typ: 'JWT', kid };
  const claims = { iss: clientId, sub: clientId, aud: TOKEN_URL, jti: randomUUID(), iat: now, exp: now + 300 };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA384').update(input).sign(createPrivateKey(readFileSync(PRIV)));
  return `${input}.${b64url(sig)}`;
}

async function getToken(clientId, scopes = DEFAULT_SCOPES) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion(clientId),
    scope: scopes,
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// GET a FHIR URL with a fresh token. Prints status, useful headers and the body (truncated).
async function get(clientId, url, { async: isAsync = false, max = 4000 } = {}) {
  const tok = await getToken(clientId);
  const headers = { Authorization: `Bearer ${tok}`, Accept: 'application/fhir+json' };
  if (isAsync) headers.Prefer = 'respond-async';
  const res = await fetch(url, { headers });
  console.log(`HTTP ${res.status}`);
  for (const h of ['content-location', 'retry-after', 'x-progress', 'content-type']) {
    if (res.headers.get(h)) console.log(`${h}: ${res.headers.get(h)}`);
  }
  const text = await res.text();
  console.log(text.length > max ? text.slice(0, max) + `\n… (${text.length} chars)` : text);
}

async function token(clientId, scopes = DEFAULT_SCOPES) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion(clientId),
    scope: scopes,
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'keys') keys();
  else if (cmd === 'assertion') console.log(assertion(args[0]));
  else if (cmd === 'token') await token(args[0], args.slice(1).join(' ') || undefined);
  else if (cmd === 'get') await get(args[0], args[1], { async: args.includes('--async') });
  else console.log('Usage: node scripts/ecw-sandbox.mjs keys | assertion <clientId> | token <clientId> [scopes]');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
