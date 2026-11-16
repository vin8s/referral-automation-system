// "Sync from Epic" (Phase 2, docs/EPIC_PROTOTYPE_PLAN.md): simulated referral feed → Relay referrals.
// Fake EHR connector only (no Epic credentials, no network).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/server/db/driver';
import type { SessionUser } from '@/lib/auth-types';
import { testDb } from './sms-harness';
import { FakeEhrConnector, FAKE_EHR_PATIENTS } from '@/server/ehr/fake';
import { getEpicSettings, saveEpicSettings, setEhrConnectorForTests } from '@/server/ehr';
import { epicLanguage, normalizeEpicPhone, syncFromEpic } from '@/server/ehr/sync';
import { EhrError, type EhrPatient } from '@/server/ehr/types';
import * as smsRepo from '@/server/sms/repo';
import { signSession } from '@/server/auth/session';

// Route handlers read the session cookie through next/headers.
let sessionToken: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (sessionToken ? { value: sessionToken } : undefined) }),
}));
const settingsRoute = await import('@/app/api/epic/settings/route');
const syncRoute = await import('@/app/api/epic/sync/route');

const ADMIN: SessionUser = { id: 'mock-admin-alex', name: 'Alex Rivera', role: 'admin' };
const MA: SessionUser = { id: 'mock-ma-priya', name: 'Priya Anand', role: 'ma' };

let db: Db;
beforeEach(async () => {
  db = await testDb();
  (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  await db.query(`update epic_settings set booking_enabled = false, patients = '[]'::jsonb, last_sync_at = null, last_sync_result = null`);
  setEhrConnectorForTests(new FakeEhrConnector());
  sessionToken = undefined;
});
afterEach(() => setEhrConnectorForTests(null));

const feed = (ids: string[], specialty: string | null = 'Family Medicine') =>
  saveEpicSettings({ bookingEnabled: false, patients: ids.map(fhirId => ({ fhirId, visitType: '95014', specialty })) }, 'Alex Rivera');

const referralsOf = async (fhirId: string) =>
  (await db.query<{ id: string; state: string; referral_source: string; specialty: string | null; name: string; phone: string; language: string; mrn: string; dob: string; sex: string }>(
    `select r.id, r.state, r.referral_source, r.specialty, p.name, p.phone, p.language, p.mrn,
            to_char(p.date_of_birth, 'YYYY-MM-DD') as dob, p.sex
       from referrals r join patients p on p.id = r.patient_id where p.epic_patient_id = $1 order by r.id`, [fhirId])).rows;

describe('syncFromEpic', () => {
  it('imports new referrals linked to the Epic patient, in the app formats, audit-logged', async () => {
    await feed(['fake-camila', 'fake-derrick']);
    const res = await syncFromEpic(ADMIN);
    expect(res).toMatchObject({ imported: 2, updated: 0, alreadyOpen: 0, errors: [], connector: 'fake' });

    const [camila] = await referralsOf('fake-camila');
    expect(camila).toMatchObject({
      state: 'Queued', referral_source: 'Epic sandbox', specialty: 'Family Medicine', name: 'Camila Maria Lopez',
      phone: '+14695555555', language: 'English', mrn: 'F203713', dob: '1987-09-12', sex: 'F',
    });
    expect(await referralsOf('fake-derrick')).toHaveLength(1);

    const { rows: audit } = await db.query<{ what: string; actor_name: string }>(
      `select what, actor_name from audit_log where referral_id = $1 and action = 'referral.ingest'`, [camila.id]);
    expect(audit).toHaveLength(1);
    expect(audit[0].what).toMatch(/Imported from Epic sandbox/);
    expect(audit[0].actor_name).toBe('Alex Rivera');

    const s = await getEpicSettings();
    expect(s.lastSyncAt).not.toBeNull();
    expect(s.lastSyncResult).toMatchObject({ imported: 2 });
  });

  it('re-sync does not duplicate an open referral (already in Relay) and keeps the staff-edited phone', async () => {
    await feed(['fake-camila']);
    await syncFromEpic(ADMIN);
    const [first] = await referralsOf('fake-camila');
    // Owner edits the demo phone (plan rule 7) and the referral moves on.
    await db.query(`update patients set phone = '+14155550123' where epic_patient_id = 'fake-camila'`);
    await db.query(`update referrals set state = 'Pending Confirmation' where id = $1`, [first.id]);

    const again = await syncFromEpic(ADMIN);
    expect(again).toMatchObject({ imported: 0, alreadyOpen: 1, errors: [] });
    expect(again.items[0]).toMatchObject({ outcome: 'already_open', referralId: first.id });
    const rows = await referralsOf('fake-camila');
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('+14155550123');
    expect((await db.query(`select 1 from patients where epic_patient_id = 'fake-camila'`)).rows).toHaveLength(1);
  });

  it('updates demographics of an already-linked patient; a Booked referral is closed so a new one is created', async () => {
    const ehr = new FakeEhrConnector(FAKE_EHR_PATIENTS.map(p => ({ ...p })));
    setEhrConnectorForTests(ehr);
    await feed(['fake-derrick']);
    await syncFromEpic(ADMIN);
    const [first] = await referralsOf('fake-derrick');
    await db.query(`update referrals set state = 'Booked' where id = $1`, [first.id]);

    const changed: EhrPatient[] = FAKE_EHR_PATIENTS.map(p => (p.id === 'fake-derrick' ? { ...p, lastName: 'Lin-Park', language: 'es' } : p));
    setEhrConnectorForTests(new FakeEhrConnector(changed));
    const res = await syncFromEpic(ADMIN);
    expect(res).toMatchObject({ imported: 1, updated: 1, alreadyOpen: 0 });
    const rows = await referralsOf('fake-derrick');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ state: 'Queued', name: 'Derrick Lin-Park', language: 'Spanish' });
    expect((await db.query(`select 1 from patients where epic_patient_id = 'fake-derrick'`)).rows).toHaveLength(1);
  });

  it('a per-patient error does not abort the sync', async () => {
    class Flaky extends FakeEhrConnector {
      async getPatient(id: string) {
        if (id === 'fake-camila') throw new EhrError('Epic sandbox timed out.', 'network');
        return super.getPatient(id);
      }
    }
    setEhrConnectorForTests(new Flaky());
    await feed(['fake-camila', 'unknown-id', 'fake-derrick']);
    const res = await syncFromEpic(ADMIN);
    expect(res.imported).toBe(1);
    expect(res.errors).toEqual([
      { fhirId: 'fake-camila', error: 'Epic sandbox timed out.' },
      { fhirId: 'unknown-id', error: 'Fake EHR has no patient unknown-id.' },
    ]);
    expect(await referralsOf('fake-derrick')).toHaveLength(1);
    expect((await getEpicSettings()).lastSyncResult).toMatchObject({ imported: 1, errors: [{ fhirId: 'fake-camila' }, { fhirId: 'unknown-id' }] });
  });

  it('a patient with no phone in Epic is reported, not imported', async () => {
    setEhrConnectorForTests(new FakeEhrConnector([{ ...FAKE_EHR_PATIENTS[0], phone: null }]));
    await feed(['fake-camila']);
    const res = await syncFromEpic(ADMIN);
    expect(res.imported).toBe(0);
    expect(res.errors[0].error).toMatch(/no phone/);
    expect((await db.query(`select 1 from patients`)).rows).toHaveLength(0);
  });

  it('new referrals respect pilot mode: they wait in Ready to text and nothing is sent', async () => {
    await db.query(`update sms_settings set approval_required = true`);
    await feed(['fake-camila']);
    await syncFromEpic(ADMIN);
    const [camila] = await referralsOf('fake-camila');
    const awaiting = await smsRepo.listAwaitingApproval(db);
    expect(awaiting.map(r => r.id)).toEqual([camila.id]);
    expect((await db.query(`select 1 from messages`)).rows).toHaveLength(0);
  });

  it('refuses to sync an empty patient list', async () => {
    await expect(syncFromEpic(ADMIN)).rejects.toThrow(/at least one Epic patient/);
  });

  it('maps phone and language to the app formats', () => {
    expect(normalizeEpicPhone('785-555-5555')).toBe('+17855555555');
    expect(normalizeEpicPhone('1 (785) 555-5555')).toBe('+17855555555');
    expect(normalizeEpicPhone(null)).toBeNull();
    expect(epicLanguage('es')).toBe('Spanish');
    expect(epicLanguage(null)).toBe('English');
    expect(epicLanguage('vi')).toBe('Vietnamese');
  });
});

describe('/api/epic routes', () => {
  const req = (method: string, path: string, body?: unknown) =>
    new Request(`http://localhost:3000/api/epic/${path}`, {
      method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const as = async (u: SessionUser) => { sessionToken = await signSession(u); };
  const body = { bookingEnabled: true, patients: [{ fhirId: 'fake-camila', visitType: '95014', specialty: 'Cardiology' }] };

  it('any signed-in staff can read; signed-out gets 401', async () => {
    expect((await settingsRoute.GET(req('GET', 'settings'), undefined)).status).toBe(401);
    await as(MA);
    const res = await settingsRoute.GET(req('GET', 'settings'), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connector: 'fake', settings: { bookingEnabled: false } });
  });

  it('MA gets 403 on PUT settings and on sync', async () => {
    await as(MA);
    expect((await settingsRoute.PUT(req('PUT', 'settings', body), undefined)).status).toBe(403);
    await feed(['fake-camila']);
    expect((await syncRoute.POST(req('POST', 'sync'), undefined)).status).toBe(403);
    expect(await referralsOf('fake-camila')).toHaveLength(0);
  });

  it('admin saves settings; the booking toggle persists', async () => {
    await as(ADMIN);
    const res = await settingsRoute.PUT(req('PUT', 'settings', body), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settings: { bookingEnabled: true, updatedBy: 'Alex Rivera' } });
    const s = await getEpicSettings();
    expect(s.bookingEnabled).toBe(true);
    expect(s.patients).toEqual([{ fhirId: 'fake-camila', visitType: '95014', specialty: 'Cardiology' }]);

    const off = await settingsRoute.PUT(req('PUT', 'settings', { ...body, bookingEnabled: false }), undefined);
    expect((await off.json()).settings.bookingEnabled).toBe(false);
    expect((await getEpicSettings()).bookingEnabled).toBe(false);
  });

  it('invalid settings answer 400 with the validation message', async () => {
    await as(ADMIN);
    const res = await settingsRoute.PUT(req('PUT', 'settings', { bookingEnabled: true, patients: [{ fhirId: 'bad id!' }] }), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a valid Epic patient FHIR ID/);
    const noFlag = await settingsRoute.PUT(req('PUT', 'settings', { patients: [] }), undefined);
    expect(noFlag.status).toBe(400);
  });

  it('admin sync returns the summary; empty list is a 400', async () => {
    await as(ADMIN);
    const empty = await syncRoute.POST(req('POST', 'sync'), undefined);
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/at least one Epic patient/);

    await feed(['fake-camila']);
    const res = await syncRoute.POST(req('POST', 'sync'), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imported: 1, alreadyOpen: 0, errors: [] });
  });
});
