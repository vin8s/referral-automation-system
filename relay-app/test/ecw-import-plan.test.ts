// eCW import: matching tiers + ambiguity and the action rules, on in-memory referral
// snapshots (no database). FAKE patients only.
import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPORT_OPTIONS } from '@/lib/ecwImport';
import { apptKeyOf, normalizeRow, type NormRow } from '@/server/import/normalize';
import { countPlan, matchRow, planImport, planReferral, sameSlot, type RefInfo } from '@/server/import/plan';

const HEADERS = ['Date', 'Time', 'Name', 'DOB', 'MRN', 'Phone', 'Provider', 'Status'];
const MAPPING = { apptDate: 'Date', apptTime: 'Time', patientName: 'Name', dob: 'DOB', mrn: 'MRN', phone: 'Phone', provider: 'Provider', status: 'Status' };
let n = 2;
function row(p: Partial<{ date: string; time: string; name: string; dob: string; mrn: string; phone: string; provider: string; status: string }>): NormRow {
  const cells = [p.date ?? '11/17/2026', p.time ?? '10:30 AM', p.name ?? 'Testpatient, Grace', p.dob ?? '03/04/1980', p.mrn ?? '',
    p.phone ?? '', p.provider ?? 'Park, Dana MD', p.status ?? 'Scheduled'];
  return normalizeRow(cells, HEADERS, MAPPING, DEFAULT_IMPORT_OPTIONS, n++);
}
function ref(p: Partial<RefInfo> & { referralId: string }): RefInfo {
  return { patientName: 'Grace Testpatient', dobIso: '1980-03-04', mrn: null, phoneKey: '4155550199', state: 'In Progress', booked: null, captured: null, ...p };
}
const TODAY = '2026-11-13';
const plan1 = (r: NormRow, refs: RefInfo[], linked = new Map<string, string>()) => planImport([{ row: r, apptKey: apptKeyOf(r) }], refs, linked, TODAY)[0];

describe('matching tiers', () => {
  it('1. MRN exact match wins', () => {
    const refs = [ref({ referralId: 'A', mrn: '777' }), ref({ referralId: 'B', patientName: 'Other Person', dobIso: '1990-01-01' })];
    expect(matchRow(row({ mrn: '00777' }), null, refs, new Map())).toEqual({ kind: 'matched', referralId: 'A', tier: 'mrn' });
  });
  it('1. MRN match with a contradicting DOB goes to review', () => {
    const refs = [ref({ referralId: 'A', mrn: '777', dobIso: '1970-01-01' })];
    expect(matchRow(row({ mrn: '777' }), null, refs, new Map())).toMatchObject({ kind: 'review', reason: 'mrn_conflict' });
  });
  it('2. DOB + name when there is no MRN match', () => {
    const refs = [ref({ referralId: 'A' })];
    expect(matchRow(row({ mrn: '999' }), null, refs, new Map())).toEqual({ kind: 'matched', referralId: 'A', tier: 'dob_name' });
  });
  it('2. DOB + name but a different MRN on file → review, never a guess', () => {
    const refs = [ref({ referralId: 'A', mrn: '555' })];
    expect(matchRow(row({ mrn: '999' }), null, refs, new Map())).toMatchObject({ kind: 'review', reason: 'mrn_conflict' });
  });
  it('3. DOB + phone when the name differs', () => {
    const refs = [ref({ referralId: 'A', patientName: 'Gracie Testpatient-Lee' })];
    expect(matchRow(row({ phone: '(415) 555-0199' }), null, refs, new Map())).toEqual({ kind: 'matched', referralId: 'A', tier: 'dob_phone' });
  });
  it('ambiguous: two referrals match at the same tier → review with both candidates', () => {
    const refs = [ref({ referralId: 'A', mrn: '777' }), ref({ referralId: 'B', mrn: '777' })];
    expect(matchRow(row({ mrn: '777' }), null, refs, new Map())).toMatchObject({ kind: 'review', reason: 'ambiguous', candidates: ['A', 'B'] });
  });
  it('ambiguity is resolved only when exactly one referral is booked at that very time', () => {
    const refs = [
      ref({ referralId: 'A', mrn: '777', state: 'Booked', booked: { day: 'Tue Nov 17', time: '10:30am', provider: 'Dr. Park', ecwApptKey: null, visitStatus: null } }),
      ref({ referralId: 'B', mrn: '777' }),
    ];
    expect(matchRow(row({ mrn: '777' }), null, refs, new Map())).toEqual({ kind: 'matched', referralId: 'A', tier: 'mrn' });
  });
  it('possible match (same DOB, different name, no phone) → review', () => {
    const refs = [ref({ referralId: 'A', patientName: 'Patricia Walsh' })];
    expect(matchRow(row({ name: 'Walsh, Patty' }), null, refs, new Map())).toMatchObject({ kind: 'review', reason: 'possible_match', candidates: ['A'] });
  });
  it('no signal at all → not in Relay (ignored)', () => {
    const refs = [ref({ referralId: 'A' })];
    const p = plan1(row({ name: 'Nobody, Ann', dob: '01/01/1999' }), refs);
    expect(p).toMatchObject({ action: 'ignore', referralId: null });
  });
  it('a row matched before (linked appointment) keeps its referral', () => {
    const r = row({ mrn: '777' });
    const refs = [ref({ referralId: 'A', mrn: '777' }), ref({ referralId: 'B', mrn: '777' })];
    expect(matchRow(r, apptKeyOf(r), refs, new Map([[apptKeyOf(r)!, 'B']]))).toEqual({ kind: 'matched', referralId: 'B', tier: 'linked' });
  });
});

const booked = (day: string, time: string, extra: Partial<NonNullable<RefInfo['booked']>> = {}) =>
  ({ day, time, provider: 'Dr. Park', ecwApptKey: null, visitStatus: null, ...extra });

describe('actions', () => {
  it('scheduled + not yet Booked → book (stop outreach)', () => {
    expect(plan1(row({}), [ref({ referralId: 'A' })])).toMatchObject({ action: 'book', referralId: 'A' });
    expect(plan1(row({ status: 'Confirmed' }), [ref({ referralId: 'A', state: 'Queued' })]).action).toBe('book');
  });
  it('Pending Confirmation for a different time → book at the eCW time', () => {
    const p = plan1(row({}), [ref({ referralId: 'A', state: 'Pending Confirmation', captured: { day: 'Wed Nov 18', time: '2:00 PM' } })]);
    expect(p.action).toBe('book');
    expect(p.detail).toContain('replaces the captured slot');
  });
  it('already Booked at the same time → no change; different time → update time', () => {
    expect(plan1(row({}), [ref({ referralId: 'A', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM') })]).action).toBe('none');
    expect(plan1(row({ time: '2:00 PM' }), [ref({ referralId: 'A', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM') })]).action).toBe('update_time');
  });
  it('cancelled / no show / rescheduled of the booked appointment → back to outreach', () => {
    const b = [ref({ referralId: 'A', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM') })];
    expect(plan1(row({ status: 'Cancelled' }), b).action).toBe('reenter_cancelled');
    expect(plan1(row({ status: 'N/S' }), b).action).toBe('reenter_no_show');
    expect(plan1(row({ status: 'R/S' }), b).action).toBe('reenter_rescheduled');
  });
  it('an old cancelled appointment never undoes the current booking (idempotent re-import)', () => {
    const b = [ref({ referralId: 'A', state: 'Booked', booked: booked('Thu Nov 19', '9:00 AM') })];
    expect(plan1(row({ status: 'Cancelled' }), b)).toMatchObject({ action: 'none', detail: 'Not the appointment booked in Relay' });
    // and a cancellation for a referral that is already back in outreach does nothing
    expect(plan1(row({ status: 'Cancelled' }), [ref({ referralId: 'A' })]).action).toBe('none');
  });
  it('rescheduled with the new time in the same file → just update the time', () => {
    const r1 = row({ status: 'Rescheduled' });
    const r2 = row({ date: '11/19/2026', time: '9:00 AM', status: 'Scheduled' });
    const refs = [ref({ referralId: 'A', mrn: '777', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM') })];
    const plan = planImport([r1, r2].map(r => ({ row: { ...r, mrn: '777' }, apptKey: apptKeyOf({ ...r, mrn: '777' }) })), refs, new Map(), TODAY);
    expect(plan.map(p => p.action)).toEqual(['none', 'update_time']);
  });
  it('checked out / arrived → record the visit (book it first if needed)', () => {
    const b = [ref({ referralId: 'A', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM') })];
    expect(plan1(row({ status: 'Checked Out' }), b)).toMatchObject({ action: 'record_visit', detail: 'Record visit: completed' });
    expect(plan1(row({ status: 'Arrived' }), [ref({ referralId: 'A' })])).toMatchObject({ action: 'record_visit', detail: 'Mark Booked and record visit: arrived' });
    const done = [ref({ referralId: 'A', state: 'Booked', booked: booked('Tue Nov 17', '10:30 AM', { visitStatus: 'completed' }) })];
    expect(plan1(row({ status: 'Checked Out' }), done).action).toBe('none');
  });
  it('escalated referrals and unknown statuses go to review', () => {
    expect(plan1(row({}), [ref({ referralId: 'A', state: 'Escalated' })])).toMatchObject({ action: 'review', reviewReason: 'escalated' });
    expect(plan1(row({ status: 'Waitlist' }), [ref({ referralId: 'A' })])).toMatchObject({ action: 'review', reviewReason: 'unknown_status' });
  });
  it('unreadable date for a matched referral → invalid, nothing changes', () => {
    expect(plan1(row({ date: '11/31/2026', mrn: '777' }), [ref({ referralId: 'A', mrn: '777' })]).action).toBe('invalid');
  });
  it('several scheduled rows for one referral: one change, the rest "other appointment"', () => {
    const rows = [row({ date: '11/20/2026' }), row({ date: '11/17/2026' })];
    const plan = planImport(rows.map(r => ({ row: r, apptKey: apptKeyOf(r) })), [ref({ referralId: 'A' })], new Map(), TODAY);
    expect(plan.map(p => p.action)).toEqual(['none', 'book']);    // earliest upcoming wins
    expect(countPlan(plan)).toMatchObject({ total: 2, booked: 1, unchanged: 1, matched: 2 });
  });
  it('sameSlot ignores the weekday (Relay days have no year) and time format', () => {
    expect(sameSlot({ day: 'Thu Apr 17', time: '9:00am' }, row({ date: '04/17/2026', time: '09:00' }))).toBe(true);
    expect(sameSlot({ day: 'Thu Apr 17', time: '9:00am' }, row({ date: '04/18/2026', time: '09:00' }))).toBe(false);
  });
  it('planReferral for a staff-picked referral', () => {
    const r = row({});
    const [p] = planReferral(ref({ referralId: 'A' }), [{ row: r, apptKey: apptKeyOf(r), tier: 'linked' }], TODAY);
    expect(p.action).toBe('book');
  });
});
