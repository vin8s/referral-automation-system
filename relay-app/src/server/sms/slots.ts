// Offered slots for the SMS agent: 2–3 free times from the shared availability grid
// (src/lib/slots.ts), minus times already captured/booked in Relay and times the MA
// rejected for this referral. Labels are built in the clinic's time zone.

import 'server-only';
import { createHash } from 'node:crypto';
import { ALL_SLOT_TIMES, dayKeyOf, slotKey } from '@/lib/slots';
import { clinicTimeZone, zonedParts, zonedTimeToUtc } from './schedule';
import type { OfferedSlot } from './types';

const DAY_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON_ES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseTime(t: string): { h: number; m: number } {
  const m = t.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)!;
  let h = +m[1] % 12;
  if (m[3] === 'PM') h += 12;
  return { h, m: +m[2] };
}

function offsetIso(utc: Date, tz: string): string {
  const p = zonedParts(utc, tz);
  const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const off = Math.round((localMs - utc.getTime()) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function slotIdFor(dayKey: string, time: string): string {
  return 's_' + createHash('sha256').update(`${dayKey}|${time}`).digest('hex').slice(0, 6);
}

/**
 * Picks up to `count` free slots on the next weekdays (starting tomorrow, clinic time),
 * one per day, rotating through the day's times so patients see morning and afternoon options.
 */
export function buildOfferedSlots(opts: {
  now: Date;
  takenKeys: Set<string>;
  excludeKeys?: Set<string>;
  providers: string[];
  count?: number;
  tz?: string;
}): OfferedSlot[] {
  const tz = opts.tz ?? clinicTimeZone();
  const count = opts.count ?? 3;
  const today = zonedParts(opts.now, tz);
  const out: OfferedSlot[] = [];
  for (let i = 1; i <= 30 && out.length < count; i++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate(), dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const dayKey = dayKeyOf(y, mo, da);
    const free = ALL_SLOT_TIMES.filter(t => {
      const k = slotKey(dayKey, t);
      return !opts.takenKeys.has(k) && !opts.excludeKeys?.has(k);
    });
    if (!free.length) continue;
    const time = free[out.length % free.length];
    const { h, m } = parseTime(time);
    const startUtc = zonedTimeToUtc(y, mo, da, h, m, tz);
    const [hm, ampm] = time.split(' ');
    out.push({
      slot_id: slotIdFor(dayKey, time),
      start: offsetIso(startUtc, tz),
      provider: opts.providers.length ? opts.providers[out.length % opts.providers.length] : 'Clinic provider',
      label_en: `${DAY_EN[dow]}, ${MON_EN[mo - 1]} ${da} at ${time}`,
      label_es: `${DAY_ES[dow]} ${da} de ${MON_ES[mo - 1]}, ${hm} ${ampm === 'AM' ? 'a. m.' : 'p. m.'}`,
      day: dayKey,
      time,
    });
  }
  return out;
}

/**
 * Every free slot on the next `days` weekdays (starting tomorrow, clinic time), in time order.
 * The AI suggests from this pool when none of the first offered times work.
 */
export function buildOpenSlotPool(opts: {
  now: Date;
  takenKeys: Set<string>;
  excludeKeys?: Set<string>;
  providers: string[];
  days?: number;
  tz?: string;
}): OfferedSlot[] {
  const tz = opts.tz ?? clinicTimeZone();
  const want = opts.days ?? 10;
  const today = zonedParts(opts.now, tz);
  const out: OfferedSlot[] = [];
  let weekdays = 0;
  for (let i = 1; i <= 30 && weekdays < want; i++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate(), dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    weekdays++;
    const dayKey = dayKeyOf(y, mo, da);
    for (const time of ALL_SLOT_TIMES) {
      const k = slotKey(dayKey, time);
      if (opts.takenKeys.has(k) || opts.excludeKeys?.has(k)) continue;
      const { h, m } = parseTime(time);
      const [hm, ampm] = time.split(' ');
      out.push({
        slot_id: slotIdFor(dayKey, time),
        start: offsetIso(zonedTimeToUtc(y, mo, da, h, m, tz), tz),
        provider: opts.providers.length ? opts.providers[out.length % opts.providers.length] : 'Clinic provider',
        label_en: `${DAY_EN[dow]}, ${MON_EN[mo - 1]} ${da} at ${time}`,
        label_es: `${DAY_ES[dow]} ${da} de ${MON_ES[mo - 1]}, ${hm} ${ampm === 'AM' ? 'a. m.' : 'p. m.'}`,
        day: dayKey,
        time,
      });
    }
  }
  return out;
}
