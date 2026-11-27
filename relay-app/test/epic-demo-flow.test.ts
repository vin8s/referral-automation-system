// Phase 5b (docs/EPIC_PROTOTYPE_PLAN.md): the demo path end to end, through the API routes the screens
// call — confirm queue marker, Confirm route (slot taken → new times by text), Reset demo → Sync again,
// slot labels in clinic time, and the booking setting switched off mid-flow.
// FakeEhrConnector only: synthetic data, no network, no Epic credentials.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/server/db/driver';
import type { SessionUser } from '@/lib/auth-types';
import type { ConfirmQueue } from '@/lib/types';
import { afterSlotRejected, handleInbound } from '@/server/sms/engine';
import { clearEpicSlotCache, epicSlotToOffered } from '@/server/sms/epicSlots';
import type { OfferedSlot } from '@/server/sms/types';
import { FakeEhrConnector } from '@/server/ehr/fake';
import { getEpicSettings, saveEpicSettings, setEhrConnectorForTests } from '@/server/ehr';
import { confirmSlot, listCalendarEvents } from '@/server/referrals';
import { signSession } from '@/server/auth/session';
import { addReferral, harness, outbound, referralState, testDb, turn, type Harness } from './sms-harness';

// Route handlers read the session cookie through next/headers.
let sessionToken: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (sessionToken ? { value: sessionToken } : undefined) }),
}));

// The Confirm route's SMS follow-ups are recorded here (the engine behaviour itself is tested below
// with the harness clock, so these route tests don't depend on the real time of day / quiet hours).
const smsCalls = { confirm: [] as string[], reject: [] as { id: string; released: { day: string; time: string } | null }[] };
vi.mock('@/server/sms', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/sms')>()),
  smsAfterConfirm: async (id: string) => { smsCalls.confirm.push(id); },
  smsAfterReject: async (id: string, released: { day: string; time: string } | null) => { smsCalls.reject.push({ id, released }); },
}));

const confirmQueueRoute = await import('@/app/api/confirm-queue/route');
const confirmRoute = await import('@/app/api/referrals/[id]/confirm/route');
const resetRoute = await import('@/app/api/demo/reset/route');
const syncRoute = await import('@/app/api/epic/sync/route');

const ADMIN: SessionUser = { id: 'mock-admin-alex', name: 'Alex Rivera', role: 'admin' };
const MA: SessionUser = { id: 'mock-ma-priya', name: 'Priya Anand', role: 'ma' };
const PHONE = '+14155550199';
const CAMILA_PHONE = '+14695555555'; // FakeEhrConnector's synthetic number, as Sync from Epic stores it

let db: Db;
let ehr: FakeEhrConnector;

beforeEach(async () => {
  db = await testDb();
  (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  ehr = new FakeEhrConnector();
  setEhrConnectorForTests(ehr);
  clearEpicSlotCache();
  sessionToken = undefined;
  smsCalls.confirm.length = 0;
  smsCalls.reject.length = 0;
});
afterEach(() => setEhrConnectorForTests(null));

const as = async (u: SessionUser) => { sessionToken = await signSession(u); };
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost:3000/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const bookingOn = (on = true, fhirIds = ['fake-camila']) =>
  saveEpicSettings({ bookingEnabled: on, patients: fhirIds.map(fhirId => ({ fhirId, visitType: '95014', specialty: 'Family Medicine' })) }, 'Admin');

async function linkToEpic(ref: string, fhirId = 'fake-camila') {
  await db.query(`update patients set epic_patient_id = $2 where id = (select patient_id from referrals where id = $1)`, [ref, fhirId]);
}

const say = (h: Harness, body: string, from = PHONE) => handleInbound(h.deps, { from, body, provider: 'mock' });

/** Patient texts their DOB (identity check) → gets times → picks option `index`. */
async function verifyAndPick(h: Harness, opts: { index?: number; from?: string; dob?: string } = {}) {
  const { index = 0, from = PHONE, dob = '1987-09-12' } = opts;
  h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: dob, says_not_patient: false, says_is_proxy: false } });
  await say(h, dob, from);
  h.model.script = input => turn({
    intent: 'slot_selected', use_template: 'slot_captured', call_outcome: 'Appointment Accepted',
    captured_slot: { slot_id: input.context.offered_slots[index].slot_id, patient_text: String(index + 1) },
  });
  await say(h, String(index + 1), from);
}

async function offeredSlots(ref: string): Promise<OfferedSlot[]> {
  const { rows } = await db.query<{ offered_slots: OfferedSlot[] }>(`select offered_slots from sms_conversations where referral_id = $1`, [ref]);
  return rows[0]?.offered_slots ?? [];
}

async function captured(ref: string) {
  const { rows } = await db.query<{ day: string; time: string; epic_slot_ref: string | null }>(
    `select day, time, epic_slot_ref from appointments where referral_id = $1 and status = 'captured'`, [ref]);
  return rows[0];
}

// ── GET /api/confirm-queue ───────────────────────────────────────────────────

describe('GET /api/confirm-queue — Epic marker follows the setting', () => {
  it('marks an Epic-captured slot epicBooking only while "Book into Epic (sandbox)" is on', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(true);
    await linkToEpic(ref);
    await verifyAndPick(harness(db));

    await as(MA);
    const on = await confirmQueueRoute.GET(req('GET', 'confirm-queue'), undefined);
    expect(on.status).toBe(200);
    const qOn = (await on.json()) as ConfirmQueue;
    expect(qOn.slots).toHaveLength(1);
    expect(qOn.slots[0]).toMatchObject({ referralId: ref, epicBooking: true, slot: expect.objectContaining({ epic: true }) });
    // The Epic $find reference never reaches the browser.
    expect(JSON.stringify(qOn)).not.toContain('fake-slot-');

    await bookingOn(false);
    const qOff = (await (await confirmQueueRoute.GET(req('GET', 'confirm-queue'), undefined)).json()) as ConfirmQueue;
    expect(qOff.slots).toHaveLength(1);
    expect('epicBooking' in qOff.slots[0]).toBe(false);
  });

  it('a built-in grid slot is never marked, even with the setting on', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' }); // not linked to Epic
    await bookingOn(true);
    await verifyAndPick(harness(db));
    await as(MA);
    const q = (await (await confirmQueueRoute.GET(req('GET', 'confirm-queue'), undefined)).json()) as ConfirmQueue;
    expect(q.slots[0].referralId).toBe(ref);
    expect(q.slots[0].epicBooking).toBeUndefined();
  });

  it('signed-out → 401', async () => {
    expect((await confirmQueueRoute.GET(req('GET', 'confirm-queue'), undefined)).status).toBe(401);
  });
});

// ── POST /api/referrals/[id]/confirm ─────────────────────────────────────────

describe('POST /api/referrals/[id]/confirm — Epic booking', () => {
  let ref: string;
  beforeEach(async () => {
    ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(true);
    await linkToEpic(ref);
    await verifyAndPick(harness(db));
    await as(MA);
  });

  it('success: books in Epic and sends the booked text (no re-offer)', async () => {
    const res = await confirmRoute.POST(req('POST', `referrals/${ref}/confirm`), ctx(ref));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, epic: { appointmentId: 'fake-appt-1' } });
    expect(smsCalls).toEqual({ confirm: [ref], reject: [] });
    expect(ehr.booked).toHaveLength(1);
  });

  it('slot taken in Epic: re-offers by text with the released slot, and strips `released` from the response', async () => {
    const cap = await captured(ref);
    ehr.takenRefs.add(cap.epic_slot_ref!);

    const res = await confirmRoute.POST(req('POST', `referrals/${ref}/confirm`), ctx(ref));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: false, code: 'slot_unavailable',
      error: 'That time is no longer open in Epic. The patient will be offered new times by text.',
    });
    expect(body).not.toHaveProperty('released');
    expect(smsCalls.confirm).toEqual([]);
    expect(smsCalls.reject).toEqual([{ id: ref, released: { day: cap.day, time: cap.time } }]);
    expect(await referralState(db, ref)).toBe('In Progress');
  });

  it('Epic outage: no text either way, the card stays for a retry', async () => {
    ehr.bookSlot = async () => { throw new Error('Could not reach Epic'); };
    const body = await (await confirmRoute.POST(req('POST', `referrals/${ref}/confirm`), ctx(ref))).json();
    expect(body).toMatchObject({ success: false, code: 'epic_error' });
    expect(smsCalls).toEqual({ confirm: [], reject: [] });
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
  });

  it('a bad referral id → 400 without touching Epic', async () => {
    const res = await confirmRoute.POST(req('POST', 'referrals/x/confirm'), ctx('bad id!'));
    expect(res.status).toBe(400);
    expect(ehr.booked).toHaveLength(0);
  });
});

describe('slot taken in Epic → new Epic times by text → second pick books', () => {
  it('re-offers fresh Epic times without the released one, then the next Confirm books', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(true);
    await linkToEpic(ref);
    const h = harness(db);
    await verifyAndPick(h);
    const first = await captured(ref);
    ehr.takenRefs.add(first.epic_slot_ref!);

    const res = await confirmSlot(ref, MA);
    expect(res).toMatchObject({ success: false, code: 'slot_unavailable', released: { day: first.day, time: first.time } });
    const offersBefore = (await outbound(db, ref)).filter(m => m.template_key === 'slot_offer').length;

    // What the Confirm route does next (smsAfterReject → afterSlotRejected), on the harness clock.
    await afterSlotRejected(h.deps, ref, res.released!);
    const offers = (await outbound(db, ref)).filter(m => m.template_key === 'slot_offer');
    expect(offers).toHaveLength(offersBefore + 1);
    const again = await offeredSlots(ref);
    expect(again.length).toBeGreaterThanOrEqual(2);
    for (const s of again) {
      expect(s.epic_slot_ref).toMatch(/^fake-slot-/);
      expect(`${s.day} ${s.time}`).not.toBe(`${first.day} ${first.time}`);
    }
    expect(offers[offers.length - 1].body).not.toContain('fake-slot-');

    h.model.script = input => turn({
      intent: 'slot_selected', use_template: 'slot_captured', call_outcome: 'Appointment Accepted',
      captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' },
    });
    await say(h, '1');
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
    const second = await confirmSlot(ref, MA);
    expect(second).toMatchObject({ success: true, epic: { appointmentId: 'fake-appt-1' } });
    expect(ehr.booked).toHaveLength(1);
    expect(ehr.booked[0].start).not.toBe(first.epic_slot_ref!.replace('fake-slot-', ''));
  });
});

// ── Offered Epic slot labels ─────────────────────────────────────────────────

describe('Epic slot labels are in clinic time and never carry the Epic reference', () => {
  const slot = (start: string) => ({
    ref: `epic-ref-${start}`, start, end: null, visitType: 'Office Visit', provider: 'Dr. Sandbox', department: 'Sandbox FM',
  });

  it('converts to the clinic time zone (standard time, daylight time, and across midnight UTC)', () => {
    const nov = epicSlotToOffered(slot('2026-11-17T15:00:00Z'), 'America/Chicago');
    expect(nov).toMatchObject({
      start: '2026-11-17T09:00:00-06:00', day: 'Tue Nov 17', time: '9:00 AM',
      label_en: 'Tue, Nov 17 at 9:00 AM', label_es: 'martes 17 de nov., 9:00 a. m.', provider: 'Dr. Sandbox',
    });
    const jul = epicSlotToOffered(slot('2026-07-14T14:30:00Z'), 'America/Chicago');
    expect(jul).toMatchObject({ start: '2026-07-14T09:30:00-05:00', label_en: 'Tue, Jul 14 at 9:30 AM' });
    // 03:30 UTC on the 18th is still the evening of the 17th in Chicago.
    const late = epicSlotToOffered(slot('2026-11-18T03:30:00Z'), 'America/Chicago');
    expect(late).toMatchObject({ day: 'Tue Nov 17', time: '9:30 PM', label_en: 'Tue, Nov 17 at 9:30 PM' });
    // Same instant, different clinic: New York is an hour later.
    expect(epicSlotToOffered(slot('2026-11-17T15:00:00Z'), 'America/New_York').label_en).toBe('Tue, Nov 17 at 10:00 AM');
  });

  it('the slot id is an opaque hash, not the Epic reference', () => {
    const s = epicSlotToOffered(slot('2026-11-17T15:00:00Z'), 'America/Chicago');
    expect(s.slot_id).toMatch(/^e_[0-9a-f]{8}$/);
    const { epic_slot_ref, ...rest } = s;
    expect(epic_slot_ref).toBe('epic-ref-2026-11-17T15:00:00Z');
    expect(JSON.stringify(rest)).not.toContain('epic-ref-');
  });

  it('in a conversation: labels match the clinic time of each Epic start; texts and model input have no Epic ref', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(true);
    await linkToEpic(ref);
    const h = harness(db); // clinic tz America/Los_Angeles
    h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: '1987-09-12', says_not_patient: false, says_is_proxy: false } });
    await say(h, '09/12/1987');

    const offered = await offeredSlots(ref);
    expect(offered.length).toBeGreaterThanOrEqual(2);
    for (const s of offered) {
      const iso = s.epic_slot_ref!.replace('fake-slot-', '');
      const expected = new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }); // e.g. "Mon, Nov 16, 6:00 AM"
      const [wd, md, time] = expected.split(', ');
      expect(s.label_en).toBe(`${wd}, ${md} at ${time}`);
      expect(s.start.endsWith('-08:00')).toBe(true);
    }

    const texts = await outbound(db, ref);
    const offer = texts.find(m => m.template_key === 'slot_offer');
    expect(offer?.body).toContain(offered[0].label_en);
    for (const m of [...texts.map(t => t.body), ...h.provider.sent.map(s => s.body)]) {
      expect(m).not.toContain('fake-slot-');
      expect(m).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
    // Model input: slot ids and labels only.
    h.model.script = () => turn({ intent: 'other' });
    await say(h, 'which is earliest?');
    for (const c of h.model.calls) {
      const json = JSON.stringify(c);
      expect(json).not.toContain('fake-slot-');
      expect(json).not.toContain('epic_slot_ref');
    }
  });
});

// ── Setting switched mid-flow ────────────────────────────────────────────────

describe('"Book into Epic (sandbox)" switched mid-flow', () => {
  it('Epic slot captured, then booking turned OFF → Confirm is connector mode (no $book)', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(true);
    await linkToEpic(ref);
    await verifyAndPick(harness(db));
    expect((await captured(ref)).epic_slot_ref).toMatch(/^fake-slot-/);

    await bookingOn(false);
    let bookCalls = 0;
    const realBook = ehr.bookSlot.bind(ehr);
    ehr.bookSlot = async input => { bookCalls++; return realBook(input); };

    const res = await confirmSlot(ref, MA);
    expect(res).toEqual({ success: true });
    expect(bookCalls).toBe(0);
    expect(ehr.booked).toHaveLength(0);
    expect(await referralState(db, ref)).toBe('Booked');
    const { rows } = await db.query<{ status: string; epic_appointment_id: string | null }>(
      `select status, epic_appointment_id from appointments where referral_id = $1`, [ref]);
    expect(rows).toEqual([{ status: 'confirmed', epic_appointment_id: null }]);
    const ev = (await listCalendarEvents()).find(e => e.referralId === ref && !e.isShadow);
    expect(ev).toBeDefined();
    expect(ev!.bookedInEpic).toBeUndefined();
    const { rows: aud } = await db.query<{ what: string }>(`select what from audit_log where referral_id = $1 and action = 'slot.confirm'`, [ref]);
    expect(aud.map(a => a.what)).toEqual(['Slot confirmed in practice system']);
  });

  it('grid slot captured with booking OFF, then turned ON → Confirm still does not call Epic', async () => {
    const ref = await addReferral(db, { dob: '1987-09-12' });
    await bookingOn(false);
    await linkToEpic(ref);
    await verifyAndPick(harness(db));
    expect((await captured(ref)).epic_slot_ref).toBeNull();

    await bookingOn(true);
    const res = await confirmSlot(ref, MA);
    expect(res).toEqual({ success: true });
    expect(ehr.booked).toHaveLength(0);
    expect(await referralState(db, ref)).toBe('Booked');
  });
});

// ── Reset demo → Sync from Epic ──────────────────────────────────────────────

describe('Reset demo, then Sync from Epic', () => {
  const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

  it('re-creates the referrals cleanly; settings survive; the slot booked in run 1 is not offered again', async () => {
    await bookingOn(true, ['fake-camila', 'fake-derrick']);
    await as(ADMIN);

    // Run 1: sync, Camila picks the first time, MA confirms → booked in (fake) Epic.
    const sync1 = await (await syncRoute.POST(req('POST', 'epic/sync'), undefined)).json();
    expect(sync1).toMatchObject({ imported: 2, alreadyOpen: 0, errors: [] });
    const camila1 = sync1.items.find((i: { fhirId: string }) => i.fhirId === 'fake-camila').referralId as string;
    const h = harness(db);
    await verifyAndPick(h, { from: CAMILA_PHONE });
    expect(await confirmSlot(camila1, MA)).toMatchObject({ success: true, epic: { appointmentId: 'fake-appt-1' } });
    const bookedStart = ehr.booked[0].start;

    // Reset demo (admin, typed RESET).
    const reset = await resetRoute.POST(req('POST', 'demo/reset', { confirm: 'RESET' }), undefined);
    expect(reset.status).toBe(200);
    for (const t of ['referrals', 'patients', 'appointments', 'messages', 'sms_conversations', 'needs_human_items', 'call_attempts']) {
      expect(await count(t), t).toBe(0);
    }
    // Configuration is kept; Epic itself is not reset (no cancel API).
    const s = await getEpicSettings();
    expect(s.bookingEnabled).toBe(true);
    expect(s.patients.map(p => p.fhirId)).toEqual(['fake-camila', 'fake-derrick']);
    expect(ehr.booked).toHaveLength(1);

    // Run 2: sync imports both again as fresh Queued referrals — nothing "already in Relay", no duplicates.
    const sync2 = await (await syncRoute.POST(req('POST', 'epic/sync'), undefined)).json();
    expect(sync2).toMatchObject({ imported: 2, alreadyOpen: 0, updated: 0, errors: [] });
    expect(await count('patients')).toBe(2);
    expect(await count('referrals')).toBe(2);
    const { rows: states } = await db.query<{ state: string }>(`select state from referrals`);
    expect(states.map(r => r.state)).toEqual(['Queued', 'Queued']);
    const camila2 = sync2.items.find((i: { fhirId: string }) => i.fhirId === 'fake-camila').referralId as string;
    // Referral numbers restart after a reset, so the $find cache must not leak run 1's times.
    expect(camila2).toBe(camila1);

    await verifyAndPick(h, { from: CAMILA_PHONE });
    const offered = await offeredSlots(camila2);
    expect(offered.map(o => o.epic_slot_ref)).not.toContain(`fake-slot-${bookedStart}`);
    expect(await confirmSlot(camila2, MA)).toMatchObject({ success: true, epic: { appointmentId: 'fake-appt-2' } });
    expect(ehr.booked.map(b => b.start)).toEqual([bookedStart, expect.not.stringMatching(bookedStart)]);
  });
});
