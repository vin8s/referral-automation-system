// Appointment slot availability — shared by the voice call flow (browser) and the
// SMS agent (server). Pure: no data access, no side effects.
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

/**
 * Returns n upcoming weekday dates with free times and pre-formatted spoken labels,
 * so the voice agent mirrors the exact format ("Tuesday, June 11th at 4:00 PM").
 * Uses the browser's local time zone (voice flow).
 */
export function buildUpcomingSlots(n: number, bookedKeys: Set<string> = new Set()) {
  const slots: { spoken_date: string; weekday: string; date: string; times: string[]; spoken_options: string[] }[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  while (slots.length < n) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const weekday = cursor.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDay = cursor.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const year = cursor.getFullYear();
      const day = cursor.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? 'st'
        : day === 2 || day === 22 ? 'nd'
        : day === 3 || day === 23 ? 'rd' : 'th';
      const spoken_date = `${weekday}, ${monthDay.replace(/\d+/, `${day}${suffix}`)}`;
      const dayKey = `${DAY_S[cursor.getDay()]} ${MONTH_S[cursor.getMonth()]} ${cursor.getDate()}`;
      const times = ALL_SLOT_TIMES.filter(t => !bookedKeys.has(`${dayKey}|${t}`));
      if (times.length > 0) {
        slots.push({ spoken_date, weekday, date: `${monthDay}, ${year}`, times, spoken_options: times.map(t => `${spoken_date} at ${t}`) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}
