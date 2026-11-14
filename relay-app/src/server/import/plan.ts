// eCW import: matching rows to referrals and deciding what each row does.
// Pure (no I/O): the same plan is shown as the dry-run preview and executed on
// Apply, so "what you see is what happens". Unit-tested in test/ecw-import-plan.test.ts.
//
// Matching tiers (first hit wins; never guesses on ambiguity):
//   0. linked    — this eCW appointment was matched before (earlier import or staff review)
//   1. mrn       — exact MRN / Account No (DOB must not contradict it)
//   2. dob_name  — same date of birth + first and last name
//   3. dob_phone — same date of birth + phone number
// More than one referral at a tier → review. A partial signal (same DOB but a
// different name, same name but a different DOB, MRN mismatch) → review.
// No signal at all → the patient has no referral in Relay → ignored (counted only).

import 'server-only';
import { normalizeTime } from '@/lib/format';
import { fmtTime, nameMatches, type NormRow, type StatusCategory } from './normalize';

export interface RefInfo {
  referralId: string;
  patientName: string;
  dobIso: string | null;
  mrn: string | null;           // normalized (normMrn)
  phoneKey: string | null;
  state: string;                // stored state: Queued | In Progress | Pending Confirmation | Booked | Escalated
  booked: { day: string; time: string; provider: string; ecwApptKey: string | null; visitStatus: string | null } | null;
  captured: { day: string; time: string } | null;
}

export type Tier = 'linked' | 'mrn' | 'dob_name' | 'dob_phone';
export type ReviewReason = 'ambiguous' | 'possible_match' | 'mrn_conflict' | 'escalated' | 'unknown_status';

export const TIER_LABEL: Record<Tier, string> = {
  linked: 'Matched before', mrn: 'MRN', dob_name: 'DOB + name', dob_phone: 'DOB + phone',
};
export const TIER_CONFIDENCE: Record<Tier, 'high' | 'medium'> = {
  linked: 'high', mrn: 'high', dob_name: 'high', dob_phone: 'medium',
};

export type MatchResult =
  | { kind: 'matched'; referralId: string; tier: Tier }
  | { kind: 'review'; reason: ReviewReason; detail: string; candidates: string[] }
  | { kind: 'none' };

export type ActionCode =
  | 'book' | 'update_time' | 'record_visit'
  | 'reenter_cancelled' | 'reenter_no_show' | 'reenter_rescheduled'
  | 'none' | 'review' | 'ignore' | 'invalid';

export interface PlannedRow {
  row: NormRow;
  apptKey: string | null;
  referralId: string | null;
  tier: Tier | null;
  action: ActionCode;
  detail: string;
  reviewReason?: ReviewReason;
  candidates?: string[];
}

// ── Slot comparison (Relay days have no year: "Tue Nov 17") ─────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue Nov 17" / "Nov 17" → "Nov 17". */
function monthDayOf(day: string): string {
  return day.trim().replace(/^[A-Za-z]{3,9},?\s+(?=[A-Za-z]{3})/, '').replace(/^([A-Za-z]{3})[a-z]*\.?\s+0?(\d{1,2}).*$/, '$1 $2');
}
function monthDayOfIso(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}

/** True when a Relay appointment (day, time) is the same local date + start time as an eCW row. */
export function sameSlot(slot: { day: string; time: string } | null | undefined, row: NormRow): boolean {
  if (!slot || !row.date || row.startMin === null) return false;
  return monthDayOf(slot.day) === monthDayOfIso(row.date) && normalizeTime(slot.time) === fmtTime(row.startMin);
}

// ── Matching ────────────────────────────────────────────────────────────────

/** Picks one referral among several for the same row, or null when it would be a guess. */
function pickOne(cands: RefInfo[], row: NormRow): RefInfo | null {
  if (cands.length === 1) return cands[0];
  const sameTime = cands.filter(c => sameSlot(c.booked, row));
  return sameTime.length === 1 ? sameTime[0] : null;
}

const uniq = (xs: RefInfo[]) => [...new Map(xs.map(x => [x.referralId, x])).values()];

export function matchRow(row: NormRow, apptKey: string | null, refs: RefInfo[], linked: Map<string, string>): MatchResult {
  if (apptKey && linked.has(apptKey)) {
    const id = linked.get(apptKey)!;
    if (refs.some(r => r.referralId === id)) return { kind: 'matched', referralId: id, tier: 'linked' };
  }

  const ids = (xs: RefInfo[]) => xs.map(x => x.referralId);
  const dobOk = (r: RefInfo) => !row.dobIso || !r.dobIso || r.dobIso === row.dobIso;

  // Tier 1: MRN.
  if (row.mrn) {
    const byMrn = refs.filter(r => r.mrn === row.mrn);
    if (byMrn.length) {
      const conflicting = byMrn.filter(r => !dobOk(r));
      if (conflicting.length) {
        return { kind: 'review', reason: 'mrn_conflict', detail: 'MRN matches but the date of birth is different', candidates: ids(byMrn) };
      }
      const one = pickOne(byMrn, row);
      return one
        ? { kind: 'matched', referralId: one.referralId, tier: 'mrn' }
        : { kind: 'review', reason: 'ambiguous', detail: `MRN matches ${byMrn.length} referrals`, candidates: ids(byMrn) };
    }
  }

  // An MRN on both sides that differs means a different patient, even with the same DOB + name.
  const mrnClash = (r: RefInfo) => !!row.mrn && !!r.mrn && r.mrn !== row.mrn;

  // Tier 2: DOB + name.
  if (row.dobIso && row.lastName) {
    const c = refs.filter(r => r.dobIso === row.dobIso && nameMatches({ first: row.firstName, last: row.lastName }, r.patientName));
    if (c.length) {
      if (c.some(mrnClash)) return { kind: 'review', reason: 'mrn_conflict', detail: 'Same name and date of birth, but a different MRN', candidates: ids(c) };
      const one = pickOne(c, row);
      return one
        ? { kind: 'matched', referralId: one.referralId, tier: 'dob_name' }
        : { kind: 'review', reason: 'ambiguous', detail: `Name and date of birth match ${c.length} referrals`, candidates: ids(c) };
    }
  }

  // Tier 3: DOB + phone.
  if (row.dobIso && row.phoneKey) {
    const c = refs.filter(r => r.dobIso === row.dobIso && r.phoneKey === row.phoneKey);
    if (c.length) {
      if (c.some(mrnClash)) return { kind: 'review', reason: 'mrn_conflict', detail: 'Same phone and date of birth, but a different MRN', candidates: ids(c) };
      const one = pickOne(c, row);
      return one
        ? { kind: 'matched', referralId: one.referralId, tier: 'dob_phone' }
        : { kind: 'review', reason: 'ambiguous', detail: `Phone and date of birth match ${c.length} referrals`, candidates: ids(c) };
    }
  }

  // Near misses: a real signal, but not enough to act on.
  const near: RefInfo[] = [];
  let detail = '';
  if (row.dobIso) {
    const sameDob = refs.filter(r => r.dobIso === row.dobIso && !mrnClash(r));
    if (sameDob.length) { near.push(...sameDob); detail = 'Same date of birth, different name'; }
  }
  if (row.lastName) {
    const sameName = refs.filter(r => nameMatches({ first: row.firstName, last: row.lastName }, r.patientName) && !mrnClash(r));
    if (sameName.length) { near.push(...sameName); detail = detail ? 'Partial match on name or date of birth' : 'Same name, different date of birth'; }
  }
  if (near.length) return { kind: 'review', reason: 'possible_match', detail, candidates: ids(uniq(near)) };
  return { kind: 'none' };
}

// ── Actions ─────────────────────────────────────────────────────────────────

const ACTIVE: StatusCategory[] = ['scheduled'];
const VISITED: StatusCategory[] = ['arrived', 'completed'];
const GONE: StatusCategory[] = ['cancelled', 'no_show', 'rescheduled'];

const slotText = (r: NormRow) => `${r.date} ${r.startMin !== null ? fmtTime(r.startMin) : ''}`.trim();

function isFatal(r: NormRow): boolean {
  return !r.date || r.startMin === null;
}

/**
 * Decides one action per referral from all of its rows in the file, then marks
 * the other rows as "no change". Rules (see README "eCW schedule import"):
 *   scheduled row → Book (not yet Booked) · update the time (Booked, different time) · nothing (same time)
 *   arrived / checked out → record the visit on the appointment (and book it if it was not Booked)
 *   cancelled / no show / rescheduled with no new time → back to outreach, only if it is the
 *     appointment currently booked in Relay (older appointments are ignored)
 * Escalated referrals and unknown statuses go to review instead.
 */
export function planReferral(ref: RefInfo, rows: { row: NormRow; apptKey: string | null; tier: Tier }[], today: string): PlannedRow[] {
  const out = new Map<NormRow, PlannedRow>();
  const base = (x: typeof rows[number]): PlannedRow => ({ row: x.row, apptKey: x.apptKey, referralId: ref.referralId, tier: x.tier, action: 'none', detail: '' });
  const set = (x: typeof rows[number], action: ActionCode, detail: string, extra: Partial<PlannedRow> = {}) =>
    out.set(x.row, { ...base(x), action, detail, ...extra });

  const valid = rows.filter(x => !isFatal(x.row));
  for (const x of rows) if (isFatal(x.row)) set(x, 'invalid', x.row.problems.join('; ') || 'Missing date or time');

  const unknown = valid.filter(x => x.row.category === 'unknown');
  for (const x of unknown) {
    set(x, 'review', `Status "${x.row.statusRaw}" is not recognised`, { reviewReason: 'unknown_status', candidates: [ref.referralId] });
  }

  const booked = ref.state === 'Booked' ? ref.booked : null;
  const isCurrent = (x: typeof rows[number]) => !!booked && (sameSlot(booked, x.row) || (!!booked.ecwApptKey && booked.ecwApptKey === x.apptKey));
  const active = valid.filter(x => ACTIVE.includes(x.row.category));
  const visited = valid.filter(x => VISITED.includes(x.row.category));
  const gone = valid.filter(x => GONE.includes(x.row.category));

  let target: typeof rows[number] | undefined;
  let action: ActionCode = 'none';
  let detail = '';

  const visitedCurrent = visited.find(isCurrent);
  if (visitedCurrent || (!active.length && visited.length)) {
    // A visit happened: record it (and book it in Relay if it wasn't Booked).
    target = visitedCurrent ?? [...visited].sort((a, b) => slotText(b.row).localeCompare(slotText(a.row)))[0];
    const visit = target.row.category === 'completed' ? 'completed' : 'arrived';
    if (booked && isCurrent(target) && booked.visitStatus === visit) {
      action = 'none'; detail = `Visit already recorded (${visit})`;
    } else {
      action = 'record_visit';
      detail = booked ? `Record visit: ${visit}` : `Mark Booked and record visit: ${visit}`;
    }
  } else if (active.length) {
    target = active.find(isCurrent)
      ?? [...active].filter(x => x.row.date! >= today).sort((a, b) => slotText(a.row).localeCompare(slotText(b.row)))[0]
      ?? [...active].sort((a, b) => slotText(b.row).localeCompare(slotText(a.row)))[0];
    if (booked && isCurrent(target)) {
      action = 'none'; detail = 'Already booked at this time';
    } else if (booked) {
      action = 'update_time'; detail = `Update booked time to ${slotText(target.row)}`;
    } else {
      action = 'book';
      detail = ref.state === 'Pending Confirmation' && ref.captured && !sameSlot(ref.captured, target.row)
        ? `Mark Booked at eCW time ${slotText(target.row)} (replaces the captured slot)`
        : `Mark Booked · stop outreach`;
    }
  } else if (gone.length) {
    target = gone.find(isCurrent);
    if (target) {
      const c = target.row.category;
      action = c === 'no_show' ? 'reenter_no_show' : c === 'rescheduled' ? 'reenter_rescheduled' : 'reenter_cancelled';
      detail = c === 'no_show' ? 'No show → back to outreach · staff call first (texting paused)'
        : c === 'rescheduled' ? 'Rescheduled, no new time in this file → back to outreach · staff check first (texting paused)'
        : 'Cancelled → back to outreach · patient offered new times by text';
    }
  }

  if (target && action !== 'none' && ref.state === 'Escalated') {
    set(target, 'review', `Referral is Escalated — resolve the escalation first (${detail})`, { reviewReason: 'escalated', candidates: [ref.referralId] });
  } else if (target) {
    set(target, action, detail);
  }

  for (const x of valid) {
    if (out.has(x.row)) continue;
    const why = ACTIVE.includes(x.row.category) || VISITED.includes(x.row.category)
      ? (target ? 'Other appointment for this patient (not the referral visit)' : 'No change')
      : !booked ? 'Referral is not Booked — nothing to cancel'
      : target ? 'Superseded by another row for this referral'
      : 'Not the appointment booked in Relay';
    set(x, 'none', why);
  }
  return rows.map(x => out.get(x.row)!);
}

export interface PlanCounts {
  total: number; matched: number; booked: number; updated: number; visits: number;
  reentered: number; review: number; ignored: number; invalid: number; unchanged: number;
}

export function planImport(
  rows: { row: NormRow; apptKey: string | null }[], refs: RefInfo[], linked: Map<string, string>, today: string,
): PlannedRow[] {
  const byRef = new Map<string, { row: NormRow; apptKey: string | null; tier: Tier }[]>();
  const result = new Map<NormRow, PlannedRow>();
  for (const x of rows) {
    const m = matchRow(x.row, x.apptKey, refs, linked);
    if (m.kind === 'matched') {
      (byRef.get(m.referralId) ?? byRef.set(m.referralId, []).get(m.referralId)!).push({ ...x, tier: m.tier });
    } else if (m.kind === 'review') {
      result.set(x.row, { row: x.row, apptKey: x.apptKey, referralId: null, tier: null, action: 'review', detail: m.detail, reviewReason: m.reason, candidates: m.candidates });
    } else {
      result.set(x.row, {
        row: x.row, apptKey: x.apptKey, referralId: null, tier: null,
        action: isFatal(x.row) && !x.row.lastName && !x.row.mrn ? 'invalid' : 'ignore',
        detail: isFatal(x.row) && !x.row.lastName && !x.row.mrn ? (x.row.problems.join('; ') || 'Empty row') : 'No referral in Relay',
      });
    }
  }
  const refById = new Map(refs.map(r => [r.referralId, r]));
  for (const [id, list] of byRef) for (const p of planReferral(refById.get(id)!, list, today)) result.set(p.row, p);
  return rows.map(x => result.get(x.row)!);
}

export function countPlan(plan: PlannedRow[]): PlanCounts {
  const c: PlanCounts = { total: plan.length, matched: 0, booked: 0, updated: 0, visits: 0, reentered: 0, review: 0, ignored: 0, invalid: 0, unchanged: 0 };
  for (const p of plan) {
    if (p.referralId && p.action !== 'review' && p.action !== 'invalid') c.matched++;
    switch (p.action) {
      case 'book': c.booked++; break;
      case 'update_time': c.updated++; break;
      case 'record_visit': c.visits++; break;
      case 'reenter_cancelled': case 'reenter_no_show': case 'reenter_rescheduled': c.reentered++; break;
      case 'review': c.review++; break;
      case 'ignore': c.ignored++; break;
      case 'invalid': c.invalid++; break;
      case 'none': c.unchanged++; break;
    }
  }
  return c;
}
