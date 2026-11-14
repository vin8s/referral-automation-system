// Timing rules for texting (AGENT_SAFETY_RULES R7). Pure functions; `now` is always passed in.

import 'server-only';

export interface OutreachSettings {
  textingPaused: boolean;
  /** Pilot mode: staff approve each referral before its first text. */
  approvalRequired: boolean;
  quietStart: string;          // 'HH:MM' local — sending allowed from here…
  quietEnd: string;            // …until here
  allowedDays: number[];       // 0 = Sunday … 6 = Saturday
  holidays: string[];          // 'YYYY-MM-DD' local dates
  cadenceDays: number[];       // [0, 2, 5, 9]
  lifetimeCap: number;         // 6
  minSpacingHours: number;     // 48
  exhaustedAfterHours: number; // 72
  aiDailyCap: number;          // 15
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  textingPaused: false,
  approvalRequired: true,
  quietStart: '08:00',
  quietEnd: '20:00',
  allowedDays: [1, 2, 3, 4, 5, 6],
  holidays: [],
  cadenceDays: [0, 2, 5, 9],
  lifetimeCap: 6,
  minSpacingHours: 48,
  exhaustedAfterHours: 72,
  aiDailyCap: 15,
};

export function clinicTimeZone(): string {
  return process.env.CLINIC_TIMEZONE || 'America/New_York';
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number; date: string }

export function zonedParts(at: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const year = +get('year'), month = +get('month'), day = +get('day');
  return {
    year, month, day, hour: +get('hour') % 24, minute: +get('minute'), weekday: WD[get('weekday')],
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** UTC instant for a local wall-clock time in `tz`. */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const want = Date.UTC(y, m - 1, d, hh, mm);
    guess += want - asUtc;
  }
  return new Date(guess);
}

function isAllowedDay(p: ZonedParts, s: OutreachSettings): boolean {
  return s.allowedDays.includes(p.weekday) && !s.holidays.includes(p.date);
}

/** True when unsolicited / non-urgent texts may go out (8am–8pm Mon–Sat local, not holidays). */
export function isWithinSendWindow(now: Date, s: OutreachSettings, tz = clinicTimeZone()): boolean {
  const p = zonedParts(now, tz);
  const mins = p.hour * 60 + p.minute;
  return isAllowedDay(p, s) && mins >= minutesOf(s.quietStart) && mins < minutesOf(s.quietEnd);
}

/** Start of the next allowed window (now if already inside one). */
export function nextSendWindow(now: Date, s: OutreachSettings, tz = clinicTimeZone()): Date {
  if (isWithinSendWindow(now, s, tz)) return now;
  const [sh, sm] = s.quietStart.split(':').map(Number);
  const p = zonedParts(now, tz);
  for (let i = 0; i < 14; i++) {
    const base = new Date(Date.UTC(p.year, p.month - 1, p.day + i, 12));
    const start = zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), sh, sm, tz);
    if (start.getTime() > now.getTime() && isAllowedDay(zonedParts(start, tz), s)) return start;
  }
  return new Date(now.getTime() + 24 * 3600_000); // misconfigured settings: try again tomorrow
}

export function localDate(at: Date, tz = clinicTimeZone()): string {
  return zonedParts(at, tz).date;
}

/** Age in whole years on `at` (local date), from 'YYYY-MM-DD'. */
export function ageOn(dobIso: string, at: Date, tz = clinicTimeZone()): number {
  const [y, m, d] = dobIso.split('-').map(Number);
  const p = zonedParts(at, tz);
  let age = p.year - y;
  if (p.month < m || (p.month === m && p.day < d)) age--;
  return age;
}

// ── Cadence (R7.3) ──────────────────────────────────────────────────────────

export interface CadenceState {
  cycleStep: number;            // index of the NEXT outreach step (0 = first_outreach not yet sent)
  cycleStartedAt: Date | null;
  lastOutreachAt: Date | null;
  outreachCount: number;        // lifetime unsolicited texts
  repliedSinceOutreach: boolean;
}

export type CadenceVerdict =
  | { action: 'send'; step: number }
  | { action: 'exhausted' }
  | { action: 'wait'; reason: string };

/**
 * Decides whether the next unsolicited outreach text is due.
 * Steps follow `cadenceDays` from the cycle start, with at least `minSpacingHours`
 * between texts, at most one per local day, and never past the lifetime cap.
 * Quiet hours are checked separately (isWithinSendWindow).
 */
export function cadenceVerdict(c: CadenceState, now: Date, s: OutreachSettings, tz = clinicTimeZone()): CadenceVerdict {
  if (c.repliedSinceOutreach) return { action: 'wait', reason: 'patient replied' };
  if (c.outreachCount >= s.lifetimeCap) return { action: 'wait', reason: 'lifetime cap reached' };
  const steps = s.cadenceDays.length;
  if (c.cycleStep >= steps) {
    if (c.lastOutreachAt && now.getTime() - c.lastOutreachAt.getTime() >= s.exhaustedAfterHours * 3600_000) {
      return { action: 'exhausted' };
    }
    return { action: 'wait', reason: 'cycle complete; waiting for reply' };
  }
  if (c.cycleStep === 0 || !c.cycleStartedAt) return { action: 'send', step: 0 };

  const dueAt = c.cycleStartedAt.getTime() + s.cadenceDays[c.cycleStep] * 24 * 3600_000;
  if (now.getTime() < dueAt) return { action: 'wait', reason: 'not due yet' };
  if (c.lastOutreachAt) {
    if (now.getTime() - c.lastOutreachAt.getTime() < s.minSpacingHours * 3600_000) return { action: 'wait', reason: 'minimum spacing' };
    if (localDate(c.lastOutreachAt, tz) === localDate(now, tz)) return { action: 'wait', reason: 'already texted today' };
  }
  return { action: 'send', step: c.cycleStep };
}
