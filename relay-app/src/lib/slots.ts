// Appointment slot availability used by the SMS agent and the eCW import.
// Pure: no data access, no side effects.
//
// Availability is the practice's standard weekday grid (ALL_SLOT_TIMES) minus any
// slot already captured or booked in Relay. eCW stays the source of truth; the MA
// checks again at confirmation.

import { normalizeTime, normCalDay } from './format';

export const ALL_SLOT_TIMES = ['9:00 AM', '10:30 AM', '2:00 PM', '4:00 PM'];

const MONTH_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue Nov 17|10:00 AM" — the conflict key used to filter taken slots. */
export function slotKey(day: string, time: string): string {
  return `${normCalDay(day) ?? day.trim()}|${normalizeTime(time)}`;
}

/** "DDD Mon D" for a calendar date (year, month 1-12, day). */
export function dayKeyOf(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_S[dt.getUTCDay()]} ${MONTH_S[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** Collects conflict keys from captured/confirmed slots. */
export function takenSlotKeys(slots: ({ day: string; time: string } | null | undefined)[]): Set<string> {
  const keys = new Set<string>();
  for (const s of slots) if (s?.day && s.time) keys.add(slotKey(s.day, s.time));
  return keys;
}

/** Assumed length of one offered slot, used to check overlap with eCW appointments. */
export const SLOT_LENGTH_MIN = 30;

function gridMinutes(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)!;
  return ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2];
}

/**
 * Maps busy intervals from the eCW schedule (local date "YYYY-MM-DD", start minute,
 * duration) onto the slot grid: every grid time that overlaps a busy interval is taken.
 */
export function busySlotsOnGrid(busy: { date: string; startMin: number; durationMin: number }[]): { day: string; time: string }[] {
  const out: { day: string; time: string }[] = [];
  for (const b of busy) {
    const [y, m, d] = b.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const end = b.startMin + Math.max(1, b.durationMin);
    for (const t of ALL_SLOT_TIMES) {
      const s = gridMinutes(t);
      if (b.startMin < s + SLOT_LENGTH_MIN && end > s) out.push({ day: dayKeyOf(y, m, d), time: t });
    }
  }
  return out;
}
