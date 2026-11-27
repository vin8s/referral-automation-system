// Epic $find offers start tomorrow in clinic time (like the built-in grid), never later the same day.
import { beforeEach, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { FakeEhrConnector } from '@/server/ehr/fake';
import { saveEpicSettings, setEhrConnectorForTests } from '@/server/ehr';
import type { EhrSlot } from '@/server/ehr/types';
import { clearEpicSlotCache, epicOpenSlots } from '@/server/sms/epicSlots';
import { addReferral, testDb } from './sms-harness';

let db: Db;
let ref: string;

beforeEach(async () => {
  db = await testDb();
  (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  clearEpicSlotCache();
  ref = await addReferral(db);
  await db.query(`update patients set epic_patient_id = 'fake-camila' where id = (select patient_id from referrals where id = $1)`, [ref]);
  await saveEpicSettings({ bookingEnabled: true, patients: [{ fhirId: 'fake-camila', visitType: '95014', specialty: null }] }, 'Admin');
});

it('drops same-day Epic slots and asks Epic from tomorrow 00:00 clinic time', async () => {
  const ehr = new FakeEhrConnector();
  let askedFrom = '';
  ehr.findSlots = async input => {
    askedFrom = input.from;
    const mk = (start: string): EhrSlot => ({ ref: `r-${start}`, start, end: null, visitType: 'Office Visit', provider: 'Dr. Test', department: 'Clinic' });
    // Monday 2026-11-16, 1:50 pm Eastern now: 3 pm today must not be offered; 9 am tomorrow is fine.
    return [mk('2026-11-16T20:00:00Z'), mk('2026-11-17T14:00:00Z')];
  };
  setEhrConnectorForTests(ehr);
  const now = new Date('2026-11-16T18:50:00Z');
  const slots = await epicOpenSlots(db, ref, { now, tz: 'America/New_York', excludeKeys: new Set(), takenKeys: new Set() });
  expect(askedFrom).toBe('2026-11-17T05:00:00Z');
  expect(slots?.map(s => s.label_en)).toEqual(['Tue, Nov 17 at 9:00 AM']);
  expect(slots?.[0]).toMatchObject({ day: 'Tue Nov 17', time: '9:00 AM', epic_slot_ref: 'r-2026-11-17T14:00:00Z' });
});

it('returns null (use the built-in grid) when booking is off', async () => {
  await saveEpicSettings({ bookingEnabled: false, patients: [] }, 'Admin');
  setEhrConnectorForTests(new FakeEhrConnector());
  expect(await epicOpenSlots(db, ref, { now: new Date(), tz: 'America/New_York', excludeKeys: new Set(), takenKeys: new Set() })).toBeNull();
});
