// Phases 3 + 4 (docs/EPIC_PROTOTYPE_PLAN.md): with "Book into Epic (sandbox)" ON, the times offered by
// text come from the EHR ($find) and the MA's Confirm books the slot ($book) and puts it on Relay's
// Calendar. OFF = connector mode exactly as before. FakeEhrConnector only — synthetic data, no network.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { handleInbound } from '@/server/sms/engine';
import { clearEpicSlotCache } from '@/server/sms/epicSlots';
import { FakeEhrConnector } from '@/server/ehr/fake';
import { saveEpicSettings, setEhrConnectorForTests } from '@/server/ehr';
import { confirmSlot, listCalendarEvents, listConfirmQueue } from '@/server/referrals';
import { addReferral, harness, outbound, referralState, testDb, turn, type Harness } from './sms-harness';

const PHONE = '+14155550199';
const ma = { id: 'u-ma', name: 'Test MA', role: 'ma' as const };
let db: Db;
let ref: string;
let ehr: FakeEhrConnector;

beforeEach(async () => {
  db = await testDb();
  (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  ehr = new FakeEhrConnector();
  setEhrConnectorForTests(ehr);
  clearEpicSlotCache();
  ref = await addReferral(db, { dob: '1987-09-12' });
});

async function linkToEpic() {
  await db.query(`update patients set epic_patient_id = 'fake-camila' where id = (select patient_id from referrals where id = $1)`, [ref]);
}

const say = (h: Harness, body: string) => handleInbound(h.deps, { from: PHONE, body, provider: 'mock' });

async function verifyAndPick(h: Harness, index = 0) {
  h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: '1987-09-12', says_not_patient: false, says_is_proxy: false } });
  await say(h, '09/12/1987');
  h.model.script = input => turn({
    intent: 'slot_selected', use_template: 'slot_captured', call_outcome: 'Appointment Accepted',
    captured_slot: { slot_id: input.context.offered_slots[index].slot_id, patient_text: String(index + 1) },
  });
  await say(h, String(index + 1));
}

describe('Book into Epic (sandbox) ON', () => {
  beforeEach(async () => {
    await saveEpicSettings({ bookingEnabled: true, patients: [{ fhirId: 'fake-camila', visitType: '95014', specialty: 'Family Medicine' }] }, 'Admin');
    await linkToEpic();
  });

  it('offers Epic times by text, then the MA Confirm books in Epic and shows it on the Calendar', async () => {
    const h = harness(db);
    await verifyAndPick(h, 0);

    // The slot captured is an Epic slot (the model only ever saw slot ids + labels, never the Epic ref).
    const { rows: cap } = await db.query<{ status: string; epic_slot_ref: string | null }>(
      `select status, epic_slot_ref from appointments where referral_id = $1`, [ref]);
    expect(cap).toEqual([{ status: 'captured', epic_slot_ref: expect.stringMatching(/^fake-slot-/) }]);
    for (const c of h.model.calls) expect(JSON.stringify(c)).not.toContain('fake-slot-');
    expect(await referralState(db, ref)).toBe('Pending Confirmation');

    const queue = await listConfirmQueue();
    expect(queue[0]).toMatchObject({ referralId: ref, epicBooking: true, slot: expect.objectContaining({ epic: true }) });

    // Nothing is booked in Epic until the MA confirms.
    expect(ehr.booked).toHaveLength(0);
    const res = await confirmSlot(ref, ma);
    expect(res).toMatchObject({ success: true, epic: { appointmentId: 'fake-appt-1' } });
    expect(ehr.booked).toHaveLength(1);
    expect(ehr.booked[0].note).toMatch(/Relay sandbox test booking.*Test MA/);

    expect(await referralState(db, ref)).toBe('Booked');
    const { rows: appt } = await db.query<{ status: string; epic_appointment_id: string }>(
      `select status, epic_appointment_id from appointments where referral_id = $1 and status = 'confirmed'`, [ref]);
    expect(appt).toEqual([{ status: 'confirmed', epic_appointment_id: 'fake-appt-1' }]);

    const events = await listCalendarEvents();
    expect(events.find(e => e.referralId === ref && !e.isShadow)).toMatchObject({ bookedInEpic: true, mirrorStatus: 'mirrored' });

    const { rows: aud } = await db.query<{ action: string; what: string }>(`select action, what from audit_log where referral_id = $1 and action = 'slot.confirm'`, [ref]);
    expect(aud[0].what).toMatch(/Booked in Epic sandbox \(appointment fake-appt-1\)/);
  });

  it('a slot taken in Epic is released and the referral returns to outreach (nothing booked)', async () => {
    const h = harness(db);
    await verifyAndPick(h, 0);
    const { rows } = await db.query<{ epic_slot_ref: string }>(`select epic_slot_ref from appointments where referral_id = $1 and status = 'captured'`, [ref]);
    ehr.takenRefs.add(rows[0].epic_slot_ref);

    const res = await confirmSlot(ref, ma);
    expect(res).toMatchObject({ success: false, code: 'slot_unavailable' });
    expect(ehr.booked).toHaveLength(0);
    expect(await referralState(db, ref)).toBe('In Progress');
    const { rows: st } = await db.query<{ status: string }>(`select status from appointments where referral_id = $1`, [ref]);
    expect(st).toEqual([{ status: 'expired' }]);
    const { rows: aud } = await db.query<{ action: string }>(`select action from audit_log where referral_id = $1`, [ref]);
    expect(aud.map(a => a.action)).toContain('epic.book_failed');
  });

  it('an Epic outage changes nothing and tells the MA to retry', async () => {
    const h = harness(db);
    await verifyAndPick(h, 0);
    ehr.bookSlot = async () => { throw Object.assign(new Error('Could not reach Epic'), { name: 'EhrError', code: 'network' }); };
    const res = await confirmSlot(ref, ma);
    expect(res).toMatchObject({ success: false, code: 'epic_error' });
    expect(res.error).toMatch(/Nothing was changed/);
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
  });

  it('Epic down while offering → no invented times, staff are flagged', async () => {
    ehr.findSlots = async () => { throw new Error('Epic down'); };
    const h = harness(db);
    h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: '1987-09-12', says_not_patient: false, says_is_proxy: false } });
    await say(h, '09/12/1987');
    const { rows } = await db.query<{ offered_slots: unknown[] }>(`select offered_slots from sms_conversations where referral_id = $1`, [ref]);
    expect(rows[0].offered_slots).toEqual([]);
    const { rows: amber } = await db.query<{ reason_code: string }>(`select reason_code from needs_human_items where referral_id = $1`, [ref]);
    expect(amber.map(a => a.reason_code)).toContain('no_slot_works');
  });
});

describe('Book into Epic (sandbox) OFF (default) = connector mode, unchanged', () => {
  it('offers built-in grid times and Confirm does not call Epic, even for an Epic-linked patient', async () => {
    await linkToEpic();
    const h = harness(db);
    await verifyAndPick(h, 0);
    const { rows } = await db.query<{ epic_slot_ref: string | null }>(`select epic_slot_ref from appointments where referral_id = $1`, [ref]);
    expect(rows).toEqual([{ epic_slot_ref: null }]);
    expect((await listConfirmQueue())[0].epicBooking).toBeUndefined();

    const res = await confirmSlot(ref, ma);
    expect(res.success).toBe(true);
    expect(res.epic).toBeUndefined();
    expect(ehr.booked).toHaveLength(0);
    expect(await referralState(db, ref)).toBe('Booked');
    expect((await outbound(db, ref)).length).toBeGreaterThan(0);
  });
});
