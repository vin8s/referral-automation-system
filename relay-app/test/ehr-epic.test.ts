// Epic sandbox connector (Phase 1, docs/EPIC_PROTOTYPE_PLAN.md). No network: fetch is mocked with
// response shapes recorded from the Epic sandbox on 2026-11-16 (synthetic test patients only).
import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { testDb } from './sms-harness';
import { buildClientAssertion } from '@/server/ehr/epic/auth';
import { loadEpicConfig, type EpicConfig } from '@/server/ehr/epic/config';
import { EpicSandboxConnector } from '@/server/ehr/epic/connector';
import { mapPatient, mapSlot } from '@/server/ehr/epic/fhir';
import { FakeEhrConnector } from '@/server/ehr/fake';
import { EhrError } from '@/server/ehr/types';
import { getEpicSettings, saveEpicSettings } from '@/server/ehr';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const cfg: EpicConfig = loadEpicConfig(env({ EPIC_CLIENT_ID: 'test-client', EPIC_KEY_ID: 'kid-1', EPIC_PRIVATE_KEY: PEM }));

const CAMILA = {
  resourceType: 'Patient', id: 'erXuFYUfucBZaryVksYEcMg3', gender: 'female', birthDate: '1987-09-12',
  identifier: [
    { use: 'usual', type: { text: 'EPIC' }, system: 'urn:oid:1.2.840.114350.1.1', value: 'E4007' },
    { use: 'usual', type: { text: 'MRN' }, system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14', value: '203713' },
  ],
  name: [{ use: 'official', text: 'Camila Maria Lopez', family: 'Lopez', given: ['Camila', 'Maria'] }],
  telecom: [{ system: 'phone', value: '469-555-5555', use: 'work' }, { system: 'phone', value: '469-555-5556', use: 'mobile' }],
  communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'en', display: 'English' }], text: 'English' }, preferred: true }],
};

const FIND_SLOT = {
  resourceType: 'Appointment', id: 'ewJp.slot1', status: 'proposed',
  start: '2026-11-18T21:00:00Z', end: '2026-11-18T21:30:00Z',
  serviceType: [{ coding: [{ code: '95014', display: 'MYCHART VIDEO VISIT' }], text: 'MYCHART VIDEO VISIT' }],
  participant: [
    { actor: { reference: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/STU3/Patient/ev4L', display: 'Professional Billing, Correct' } },
    { actor: { reference: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/STU3/Practitioner/eM5C', display: 'Physician Family Medicine, MD' } },
    { actor: { reference: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/STU3/Location/e4W4', display: 'EMC Family Medicine' } },
  ],
};

type Call = { url: string; init: RequestInit };
function mockFetch(routes: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = url.endsWith('/oauth2/token')
      ? { status: 200, body: { access_token: 'tok-' + calls.length, token_type: 'Bearer', expires_in: 3600 } }
      : routes(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

describe('Epic config: sandbox only', () => {
  it('defaults to the fhir.epic.com sandbox URLs', () => {
    expect(cfg.tokenUrl).toBe('https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token');
    expect(cfg.r4Base).toBe('https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4');
  });

  it('refuses any non-sandbox host (no real clinic or production Epic)', () => {
    expect(() => loadEpicConfig(env({ EPIC_CLIENT_ID: 'x', EPIC_KEY_ID: 'k', EPIC_PRIVATE_KEY: PEM,
      EPIC_FHIR_R4_BASE: 'https://epicproxy.somehospital.org/api/FHIR/R4' }))).toThrow(/sandbox prototype only/);
    expect(() => loadEpicConfig(env({ EPIC_CLIENT_ID: 'x', EPIC_KEY_ID: 'k', EPIC_PRIVATE_KEY: PEM,
      EPIC_TOKEN_URL: 'http://fhir.epic.com/oauth2/token' }))).toThrow(EhrError);
  });

  it('requires client id, key id and a private key', () => {
    expect(() => loadEpicConfig(env({}))).toThrow(/EPIC_CLIENT_ID/);
    expect(() => loadEpicConfig(env({ EPIC_CLIENT_ID: 'x' }))).toThrow(/EPIC_KEY_ID/);
    expect(() => loadEpicConfig(env({ EPIC_CLIENT_ID: 'x', EPIC_KEY_ID: 'k' }))).toThrow(/PRIVATE_KEY/);
  });
});

describe('Epic client assertion', () => {
  it('is an RS384 JWT with iss = sub = client id, aud = token URL, short expiry, kid', () => {
    const jwt = buildClientAssertion(cfg, 1_800_000_000);
    const [h, c] = jwt.split('.').slice(0, 2).map(p => JSON.parse(Buffer.from(p, 'base64url').toString()));
    expect(h).toEqual({ alg: 'RS384', typ: 'JWT', kid: 'kid-1' });
    expect(c.iss).toBe('test-client');
    expect(c.sub).toBe('test-client');
    expect(c.aud).toBe(cfg.tokenUrl);
    expect(c.exp - c.iat).toBeLessThanOrEqual(300);
    expect(c.jti).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('FHIR → Relay mapping', () => {
  it('maps a patient: mobile phone first, MRN, language, no clinical data', () => {
    const p = mapPatient(CAMILA);
    expect(p).toMatchObject({
      id: 'erXuFYUfucBZaryVksYEcMg3', mrn: '203713', firstName: 'Camila Maria', lastName: 'Lopez',
      birthDate: '1987-09-12', sex: 'female', phone: '469-555-5556', phoneUse: 'mobile', language: 'en',
    });
  });

  it('maps Spanish when only language text is given', () => {
    expect(mapPatient({ ...CAMILA, communication: [{ language: { text: 'Spanish' } }] }).language).toBe('es');
  });

  it('maps a $find slot with provider and department', () => {
    expect(mapSlot(FIND_SLOT)).toEqual({
      ref: 'ewJp.slot1', start: '2026-11-18T21:00:00Z', end: '2026-11-18T21:30:00Z', visitType: 'MYCHART VIDEO VISIT',
      provider: 'Physician Family Medicine, MD', department: 'EMC Family Medicine',
    });
  });
});

describe('EpicSandboxConnector', () => {
  it('reads a patient with a bearer token and reuses the token', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 200, body: CAMILA }));
    const c = new EpicSandboxConnector(cfg, impl);
    await c.getPatient('erXuFYUfucBZaryVksYEcMg3');
    await c.getPatient('erXuFYUfucBZaryVksYEcMg3');
    expect(calls.filter(x => x.url.endsWith('/oauth2/token'))).toHaveLength(1);
    const read = calls.find(x => x.url.includes('/R4/Patient/'))!;
    expect((read.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer tok-/);
  });

  it('$find posts service-type (not serviceType) and the MRN, and returns slots', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 200, body: { resourceType: 'Bundle', entry: [{ resource: FIND_SLOT }] } }));
    const c = new EpicSandboxConnector(cfg, impl);
    const slots = await c.findSlots({ patient: mapPatient(CAMILA), from: '2026-11-17T00:00:00Z', to: '2026-12-01T00:00:00Z', visitType: '95014' });
    expect(slots.map(s => s.ref)).toEqual(['ewJp.slot1']);
    const post = calls.find(x => x.url.endsWith('/STU3/Appointment/$find'))!;
    const body = JSON.parse(String(post.init.body));
    const names = body.parameter.map((p: { name: string }) => p.name);
    expect(names).toContain('service-type');
    expect(names).not.toContain('serviceType');
    const pt = body.parameter.find((p: { name: string }) => p.name === 'patient').resource;
    expect(pt.identifier).toEqual([expect.objectContaining({ value: '203713' })]);
    expect(JSON.stringify(pt)).not.toMatch(/469-555/); // no phone sent to $find
  });

  it('$book returns the booked appointment', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 200, body: { ...FIND_SLOT, id: 'booked-1', status: 'booked', comment: 'Relay sandbox test booking' } }));
    const c = new EpicSandboxConnector(cfg, impl);
    const a = await c.bookSlot({ patientId: 'ev4L', slotRef: 'ewJp.slot1', note: 'Relay sandbox test booking' });
    expect(a).toMatchObject({ id: 'booked-1', status: 'booked', start: '2026-11-18T21:00:00Z', provider: 'Physician Family Medicine, MD' });
    const body = JSON.parse(String(calls.find(x => x.url.endsWith('/$book'))!.init.body));
    expect(body.parameter).toEqual([
      { name: 'patient', valueIdentifier: { value: 'ev4L' } },
      { name: 'appointment', valueIdentifier: { value: 'ewJp.slot1' } },
      { name: 'appointmentNote', valueString: 'Relay sandbox test booking' },
    ]);
  });

  it('$book failure on a stale/taken slot is slot_unavailable', async () => {
    const { impl } = mockFetch(() => ({ status: 400, body: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: 'The appointment is no longer available.' }] } }));
    const c = new EpicSandboxConnector(cfg, impl);
    await expect(c.bookSlot({ patientId: 'p', slotRef: 's', note: 'n' })).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('a 401 refreshes the token once, then reports an auth error', async () => {
    const { impl, calls } = mockFetch(() => ({ status: 401, body: {} }));
    const c = new EpicSandboxConnector(cfg, impl);
    await expect(c.getPatient('x')).rejects.toMatchObject({ code: 'auth' });
    expect(calls.filter(x => x.url.endsWith('/oauth2/token'))).toHaveLength(2);
  });

  it('invalid_client explains the sandbox sync delay', async () => {
    const impl = (async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 })) as typeof fetch;
    const r = await new EpicSandboxConnector(cfg, impl).ping();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/up to an hour/);
  });
});

describe('FakeEhrConnector', () => {
  it('books only a proposed slot, once', async () => {
    const f = new FakeEhrConnector();
    const p = await f.getPatient('fake-camila');
    const slots = await f.findSlots({ patient: p, from: '2026-11-16T12:00:00Z', to: '2026-12-01T00:00:00Z', visitType: '95014' });
    expect(slots.length).toBeGreaterThan(0);
    const a = await f.bookSlot({ patientId: p.id, slotRef: slots[0].ref, note: 'test' });
    expect(a.status).toBe('booked');
    await expect(f.bookSlot({ patientId: p.id, slotRef: slots[0].ref, note: 'again' })).rejects.toMatchObject({ code: 'slot_unavailable' });
    expect(await f.searchAppointments(p.id)).toHaveLength(1);
  });
});

describe('Epic settings', () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  });

  it('booking is OFF by default with an empty patient list', async () => {
    expect(await getEpicSettings()).toMatchObject({ bookingEnabled: false, patients: [] });
  });

  it('saves the toggle and patient list, defaulting the visit type', async () => {
    const s = await saveEpicSettings({ bookingEnabled: true, patients: [{ fhirId: 'erXuFYUfucBZaryVksYEcMg3', visitType: '', specialty: 'Family Medicine' }] }, 'Admin');
    expect(s.bookingEnabled).toBe(true);
    expect(s.patients).toEqual([{ fhirId: 'erXuFYUfucBZaryVksYEcMg3', visitType: '95014', specialty: 'Family Medicine' }]);
    expect(s.updatedBy).toBe('Admin');
  });

  it('rejects bad or duplicate IDs', async () => {
    await expect(saveEpicSettings({ bookingEnabled: false, patients: [{ fhirId: 'bad id!', visitType: '95014', specialty: null }] }, 'A')).rejects.toThrow(/not a valid/);
    await expect(saveEpicSettings({ bookingEnabled: false, patients: [
      { fhirId: 'abc', visitType: '95014', specialty: null }, { fhirId: 'abc', visitType: '95014', specialty: null }] }, 'A')).rejects.toThrow(/twice/);
  });
});
