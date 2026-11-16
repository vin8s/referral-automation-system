// Epic sandbox connector configuration from environment variables (never committed).
//
//   EPIC_CLIENT_ID          Non-Production Client ID from fhir.epic.com → Build Apps
//   EPIC_PRIVATE_KEY_PATH   path to the RSA private key PEM (local dev: docs/private/…)
//   EPIC_PRIVATE_KEY        …or the PEM itself (deployed: from Secrets Manager)
//   EPIC_KEY_ID             the `kid` of that key in the app's JWK Set
//   EPIC_TOKEN_URL / EPIC_FHIR_R4_BASE / EPIC_FHIR_STU3_BASE   optional overrides
//
// SANDBOX ONLY: every URL must be on fhir.epic.com (CLAUDE.md "native booking: sandbox prototype only").

import fs from 'node:fs';
import path from 'node:path';
import { EhrError } from '../types';

export const EPIC_SANDBOX_HOST = 'fhir.epic.com';
const DEFAULT_BASE = 'https://fhir.epic.com/interconnect-fhir-oauth';

export interface EpicConfig {
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  tokenUrl: string;
  r4Base: string;
  stu3Base: string;
}

function assertSandboxUrl(name: string, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new EhrError(`${name} is not a valid URL.`, 'config');
  }
  if (u.protocol !== 'https:' || u.hostname !== EPIC_SANDBOX_HOST) {
    throw new EhrError(
      `${name} must be an https://${EPIC_SANDBOX_HOST} URL. Epic booking is a sandbox prototype only.`, 'config');
  }
  return raw.replace(/\/+$/, '');
}

export function isEpicConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.EPIC_CLIENT_ID?.trim());
}

export function loadEpicConfig(env: NodeJS.ProcessEnv = process.env): EpicConfig {
  const clientId = env.EPIC_CLIENT_ID?.trim();
  if (!clientId) throw new EhrError('EPIC_CLIENT_ID is not set.', 'config');
  const keyId = env.EPIC_KEY_ID?.trim();
  if (!keyId) throw new EhrError('EPIC_KEY_ID is not set (the kid of your key in the JWK Set).', 'config');

  let privateKeyPem = env.EPIC_PRIVATE_KEY?.trim() ?? '';
  if (!privateKeyPem && env.EPIC_PRIVATE_KEY_PATH) {
    const p = path.resolve(process.cwd(), env.EPIC_PRIVATE_KEY_PATH);
    try {
      privateKeyPem = fs.readFileSync(p, 'utf8');
    } catch {
      throw new EhrError(`Could not read EPIC_PRIVATE_KEY_PATH (${env.EPIC_PRIVATE_KEY_PATH}).`, 'config');
    }
  }
  if (!privateKeyPem.includes('PRIVATE KEY')) {
    throw new EhrError('Set EPIC_PRIVATE_KEY_PATH (or EPIC_PRIVATE_KEY) to the app\'s RSA private key PEM.', 'config');
  }

  return {
    clientId,
    keyId,
    privateKeyPem,
    tokenUrl: assertSandboxUrl('EPIC_TOKEN_URL', env.EPIC_TOKEN_URL || `${DEFAULT_BASE}/oauth2/token`),
    r4Base: assertSandboxUrl('EPIC_FHIR_R4_BASE', env.EPIC_FHIR_R4_BASE || `${DEFAULT_BASE}/api/FHIR/R4`),
    stu3Base: assertSandboxUrl('EPIC_FHIR_STU3_BASE', env.EPIC_FHIR_STU3_BASE || `${DEFAULT_BASE}/api/FHIR/STU3`),
  };
}
