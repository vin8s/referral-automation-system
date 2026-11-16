// Phase 3 (docs/EPIC_PROTOTYPE_PLAN.md): when "Book into Epic (sandbox)" is ON and the referral's patient
// came from Epic (patients.epic_patient_id), the times offered by text come from Epic $find instead of
// Relay's built-in availability grid. Returns null when Epic mode doesn't apply → callers use the grid.
//
// Epic holds $find slots only briefly, so results are cached per referral for a few minutes and the
// MA's Confirm re-checks with Epic when it books (src/server/referrals.ts).

import 'server-only';
import { createHash } from 'node:crypto';
import type { Queryable } from '../db';
import { getEhrConnector, getEpicSettings } from '../ehr';
import type { EhrPatient, EhrSlot } from '../ehr/types';
import { dayKeyOf, slotKey } from '@/lib/slots';
import { zonedParts } from './schedule';
import type { OfferedSlot } from './types';

const DAY_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON_ES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CACHE_MS = 3 * 60_000;
const SEARCH_DAYS = 14;
const cache = new Map<string, { at: number; slots: OfferedSlot[] }>();

/** Drops cached $find results (one referral, or all). Used after a failed $book and by tests. */
export function clearEpicSlotCache(referralId?: string): void {
  if (referralId) cache.delete(referralId);
  else cache.clear();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function offsetIso(utc: Date, tz: string): string {
  const p = zonedParts(utc, tz);
  const off = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utc.getTime()) / 60000);
  const a = Math.abs(off);
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}:00${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** EHR slot → the OfferedSlot shape the SMS engine already uses (labels in clinic time). */
export function epicSlotToOffered(s: EhrSlot, tz: string): OfferedSlot {
  const at = new Date(s.start);
  const p = zonedParts(at, tz);
  const h12 = p.hour % 12 || 12;
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  const time = `${h12}:${pad(p.minute)} ${ampm}`;
  const dow = p.weekday;
  return {
    slot_id: 'e_' + createHash('sha256').update(s.ref).digest('hex').slice(0, 8),
    start: offsetIso(at, tz),
    provider: s.provider ?? 'Clinic provider',
    label_en: `${DAY_EN[dow]}, ${MON_EN[p.month - 1]} ${p.day} at ${time}`,
    label_es: `${DAY_ES[dow]} ${p.day} de ${MON_ES[p.month - 1]}, ${h12}:${pad(p.minute)} ${ampm === 'AM' ? 'a. m.' : 'p. m.'}`,
    day: dayKeyOf(p.year, p.month, p.day),
    time,
    epic_slot_ref: s.ref,
  };
}

async function epicPatientIdFor(q: Queryable, referralId: string): Promise<string | null> {
  const { rows } = await q.query<{ epic_patient_id: string | null }>(
    `select p.epic_patient_id from referrals r join patients p on p.id = r.patient_id where r.id = $1`, [referralId]);
  return rows[0]?.epic_patient_id ?? null;
}

/** All open Epic slots for this referral's patient (cached briefly), or null when Epic mode is off. */
export async function epicOpenSlots(
  q: Queryable, referralId: string, opts: { now: Date; tz: string; excludeKeys: Set<string>; takenKeys: Set<string> },
): Promise<OfferedSlot[] | null> {
  const settings = await getEpicSettings(q);
  if (!settings.bookingEnabled) return null;
  const epicId = await epicPatientIdFor(q, referralId);
  if (!epicId) return null;

  let all = cache.get(referralId);
  if (!all || opts.now.getTime() - all.at > CACHE_MS) {
    const feed = settings.patients.find(p => p.fhirId === epicId);
    const ehr = getEhrConnector();
    let patient: EhrPatient;
    let found: EhrSlot[];
    try {
      patient = await ehr.getPatient(epicId);
      const from = new Date(opts.now.getTime() + 60 * 60_000);
      const to = new Date(opts.now.getTime() + SEARCH_DAYS * 86400_000);
      found = await ehr.findSlots({
        patient, from: from.toISOString().slice(0, 19) + 'Z', to: to.toISOString().slice(0, 19) + 'Z', visitType: feed?.visitType ?? '95014',
      });
    } catch (err) {
      // Epic down / not synced yet: offer nothing rather than invented times; the engine raises amber no_slot_works.
      console.error('[epic] $find failed for referral', referralId, err instanceof Error ? err.message : err);
      return [];
    }
    all = { at: opts.now.getTime(), slots: found.filter(s => new Date(s.start) > opts.now).map(s => epicSlotToOffered(s, opts.tz)) };
    cache.set(referralId, all);
  }
  return all.slots.filter(s => !opts.excludeKeys.has(slotKey(s.day, s.time)) && !opts.takenKeys.has(slotKey(s.day, s.time)));
}

/** Up to `count` offers spread over different days (like the built-in grid: one per day, first come). */
export function pickSpread(slots: OfferedSlot[], count = 3): OfferedSlot[] {
  const out: OfferedSlot[] = [];
  const days = new Set<string>();
  for (const s of slots) {
    if (out.length >= count) break;
    if (days.has(s.day)) continue;
    days.add(s.day);
    out.push(s);
  }
  for (const s of slots) {
    if (out.length >= count) break;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
