// eCW import: turns mapped spreadsheet cells into normalized appointment rows.
// Pure functions (no I/O), unit-tested in test/ecw-import-normalize.test.ts.
//
// All appointment dates/times are eCW wall-clock times in the clinic's time zone
// (CLINIC_TIMEZONE). They are kept as a local date + minutes after midnight and
// only turned into an instant (zonedTimeToUtc) when stored, so DST is handled once.

import 'server-only';
import type { EcwImportOptions, EcwMapping } from '@/lib/ecwImport';

export type StatusCategory = 'scheduled' | 'arrived' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled' | 'unknown';

export interface NormRow {
  /** Spreadsheet row number (header = row 1). */
  rowNumber: number;
  displayName: string;
  firstName: string | null;     // normalized tokens for matching
  lastName: string | null;
  dobIso: string | null;
  mrn: string | null;
  phoneKey: string | null;      // last 10 digits
  date: string | null;          // YYYY-MM-DD (clinic local)
  startMin: number | null;      // minutes after local midnight
  durationMin: number | null;
  provider: string | null;
  facility: string | null;
  visitType: string | null;
  statusRaw: string | null;
  category: StatusCategory;
  apptId: string | null;
  problems: string[];
}

// ── Cells ───────────────────────────────────────────────────────────────────

const clean = (v: string | undefined | null): string | null => {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validYmd(y: number, m: number, d: number): boolean {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Two-digit years: DOBs are in the past (pivot on the current year), appointments are 20xx. */
function fullYear(y: string, kind: 'dob' | 'appt', now: Date): number {
  if (y.length === 4) return +y;
  const yy = +y;
  if (kind === 'appt') return 2000 + yy;
  const cur = now.getUTCFullYear() % 100;
  return yy > cur ? 1900 + yy : 2000 + yy;
}

/** Excel serial day number (1900 system) → Y-M-D. */
function fromExcelSerial(n: number): { y: number; m: number; d: number } {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400_000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export interface ParsedDate { date: string; timeMin: number | null }

/**
 * Parses a date (optionally followed by a time) as written in an eCW export:
 * 11/17/2026, 11-17-26, 2026-11-17, 2026-11-17T10:30, Nov 17, 2026, Tuesday, November 17, 2026 10:30 AM,
 * or an Excel serial number. Returns null when it is not a real calendar date.
 */
export function parseDate(raw: string | null | undefined, order: 'MDY' | 'DMY' = 'MDY', kind: 'dob' | 'appt' = 'appt', now = new Date()): ParsedDate | null {
  const s = clean(raw);
  if (!s) return null;

  const withTime = (y: number, m: number, d: number, rest: string): ParsedDate | null => {
    if (!validYmd(y, m, d)) return null;
    const r = rest.trim();
    if (!r) return { date: iso(y, m, d), timeMin: null };
    const t = parseTime(r);
    return t === null ? null : { date: iso(y, m, d), timeMin: t };
  };

  // ISO: 2026-11-17, 2026-11-17T10:30:00, 2026-11-17 10:30
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/);
  if (m) return withTime(+m[1], +m[2], +m[3], (m[4] ?? '').replace(/(Z|[+-]\d{2}:?\d{2})$/, ''));

  // Numeric: 11/17/2026, 11-17-26, 11.17.2026 (+ optional time)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ ,T]+(.*))?$/);
  if (m) {
    const [a, b] = order === 'MDY' ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return withTime(fullYear(m[3], kind, now), a, b, m[4] ?? '');
  }

  // Month names: "Nov 17, 2026", "Tuesday, November 17, 2026 10:30 AM", "17 Nov 2026"
  const named = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  m = named.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[ ,]+(.*))?$/);
  if (m && MONTHS[m[1].toLowerCase().slice(0, 3)]) {
    return withTime(+m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], +m[2], m[4] ?? '');
  }
  m = named.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s,-]+(\d{4})(?:[ ,]+(.*))?$/);
  if (m && MONTHS[m[2].toLowerCase().slice(0, 3)]) {
    return withTime(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1], m[4] ?? '');
  }

  // Excel serial date (optionally with a time fraction): 46343 or 46343.4375
  m = s.match(/^(\d{5})(\.\d+)?$/);
  if (m) {
    const n = parseFloat(s);
    if (n > 1 && n < 80000) {
      const { y, m: mo, d } = fromExcelSerial(n);
      const frac = n - Math.floor(n);
      return validYmd(y, mo, d) ? { date: iso(y, mo, d), timeMin: frac > 0 ? Math.round(frac * 1440) % 1440 : null } : null;
    }
  }
  return null;
}

// ── Times ───────────────────────────────────────────────────────────────────

/**
 * Minutes after midnight for "10:30 AM", "10:30am", "10:30 a.m.", "10 AM", "14:30", "14:30:00",
 * "0930" / "1430" (military), or an Excel time fraction ("0.4375"). Null if not a time.
 */
export function parseTime(raw: string | null | undefined): number | null {
  const t = clean(raw)?.toLowerCase();
  if (!t) return null;
  if (/^0?\.\d+$/.test(t)) {                       // Excel time fraction
    const f = parseFloat(t);
    return f >= 0 && f < 1 ? Math.round(f * 1440) % 1440 : null;
  }
  const s = t.replace(/\./g, '');                  // "a.m." → "am"

  let m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))? ?(am|pm|a|p)$/);
  if (m) {
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h < 1 || h > 12 || mi > 59) return null;
    const pm = m[4].startsWith('p');
    return ((h % 12) + (pm ? 12 : 0)) * 60 + mi;
  }
  m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const h = +m[1], mi = +m[2];
    return h <= 23 && mi <= 59 ? h * 60 + mi : null;
  }
  m = s.match(/^(\d{2})(\d{2})$/);
  if (m) {
    const h = +m[1], mi = +m[2];
    return h <= 23 && mi <= 59 ? h * 60 + mi : null;
  }
  return null;
}

/** 630 → "10:30 AM" (the calendar / slot format). */
export function fmtTime(min: number): string {
  const h = Math.floor(min / 60), mi = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function parseDuration(raw: string | null | undefined): number | null {
  const s = clean(raw)?.toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,3})(?:\s*(?:min|mins|minutes|m))?$/);
  if (m) return +m[1] > 0 && +m[1] <= 600 ? +m[1] : null;
  m = s.match(/^(\d{1,2}):(\d{2})$/);       // 0:30 or 1:15
  if (m) return +m[1] * 60 + +m[2] || null;
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/);
  if (m) return Math.round(parseFloat(m[1]) * 60) || null;
  return null;
}

// ── Names, phones, MRNs ─────────────────────────────────────────────────────

/** Lowercase letters only, accents removed: "O'Brien-Núñez" → ["obrien", "nunez"] (hyphen splits). */
export function nameTokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’`.]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Splits a name into first / last. "Okafor, James A" → James / Okafor (comma = "Last, First").
 * Without a comma: first word = first name, last word = last name (or the reverse for 'last_first').
 */
export function splitName(raw: string, order: EcwImportOptions['nameOrder'] = 'auto'): { first: string; last: string } | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.includes(',') && order !== 'first_last') {
    const comma = s.indexOf(","); const last = s.slice(0, comma), rest = s.slice(comma + 1);
    const first = nameTokens(rest ?? '')[0];
    const lastT = nameTokens(last);
    return first && lastT.length ? { first, last: lastT.join(' ') } : null;
  }
  const t = nameTokens(s);
  if (t.length < 2) return null;
  if (order === 'last_first') return { last: t[0], first: t[1] };
  return { first: t[0], last: t[t.length - 1] };
}

/** True when the Relay patient name contains the row's first name and every last-name token. */
export function nameMatches(row: { first: string | null; last: string | null }, relayName: string): boolean {
  if (!row.first || !row.last) return false;
  const tokens = new Set(nameTokens(relayName));
  return tokens.has(row.first) && row.last.split(' ').every(t => tokens.has(t));
}

export function phoneKey(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

/** "00123 45" → "12345": case-insensitive, spaces/dashes and leading zeros ignored. */
export function normMrn(raw: string | null | undefined): string | null {
  const s = (raw ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/^0+(?=.)/, '');
  return s ? s : null;
}

export function normProvider(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Status ──────────────────────────────────────────────────────────────────

const STATUS_WORDS: [StatusCategory, string[]][] = [
  ['no_show', ['no show', 'noshow', 'n s', 'ns', 'did not show', 'dnka', 'did not keep appointment', 'missed', 'no show no call']],
  ['rescheduled', ['rescheduled', 'resched', 'r s', 'rs', 'bumped', 'moved']],
  ['cancelled', ['cancelled', 'canceled', 'cancel', 'canc', 'can', 'cx', 'deleted', 'void']],
  ['completed', ['checked out', 'check out', 'checkout', 'chkout', 'co', 'completed', 'complete', 'done', 'seen', 'billed', 'visit complete']],
  ['arrived', ['arrived', 'arr', 'checked in', 'check in', 'checkin', 'chk', 'in room', 'roomed', 'with provider', 'ready for provider']],
  ['scheduled', ['scheduled', 'sched', 'pending', 'pen', 'confirmed', 'conf', 'booked', 'reminder sent', 'left message', 'lm', 'new', 'open', 'active', 's']],
];

/** Maps an eCW status (full word or code such as CHK, N/S, R/S, CANC, PEN) to a category. Blank = scheduled. */
export function statusCategory(raw: string | null | undefined): StatusCategory {
  const s = (raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return 'scheduled';
  for (const [cat, words] of STATUS_WORDS) if (words.includes(s)) return cat;
  if (/\bno ?show\b/.test(s)) return 'no_show';
  if (/^resched/.test(s)) return 'rescheduled';
  if (/cancel/.test(s)) return 'cancelled';
  if (/check(ed)? ?out|complete/.test(s)) return 'completed';
  if (/arriv|check(ed)? ?in/.test(s)) return 'arrived';
  if (/^(scheduled|confirm|pending)/.test(s)) return 'scheduled';
  return 'unknown';
}

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  scheduled: 'Scheduled', arrived: 'Arrived', completed: 'Completed', cancelled: 'Cancelled',
  no_show: 'No show', rescheduled: 'Rescheduled', unknown: 'Unknown status',
};

// ── Row ─────────────────────────────────────────────────────────────────────

export function normalizeRow(
  cells: string[], headers: string[], mapping: EcwMapping, opts: EcwImportOptions, rowNumber: number, now = new Date(),
): NormRow {
  const col = (f: keyof EcwMapping): string | null => {
    const h = mapping[f];
    if (!h) return null;
    const idx = headers.indexOf(h);
    return idx >= 0 ? clean(cells[idx]) : null;
  };
  const problems: string[] = [];

  let first: string | null = null, last: string | null = null, displayName = '';
  if (mapping.lastName && mapping.firstName && (col('lastName') || col('firstName'))) {
    const l = nameTokens(col('lastName') ?? ''), f = nameTokens(col('firstName') ?? '');
    last = l.length ? l.join(' ') : null;
    first = f[0] ?? null;
    displayName = [col('firstName'), col('lastName')].filter(Boolean).join(' ');
  } else if (col('patientName')) {
    const n = splitName(col('patientName')!, opts.nameOrder);
    first = n?.first ?? null; last = n?.last ?? null;
    displayName = col('patientName')!;
  }

  const dob = parseDate(col('dob'), opts.dateOrder, 'dob', now);
  if (col('dob') && !dob) problems.push('Date of birth not readable');

  const apptRaw = col('apptDate');
  const appt = parseDate(apptRaw, opts.dateOrder, 'appt', now);
  if (!apptRaw) problems.push('No appointment date');
  else if (!appt) problems.push('Appointment date not readable');

  let startMin = appt?.timeMin ?? null;
  const timeRaw = col('apptTime');
  if (timeRaw) {
    const t = parseTime(timeRaw) ?? parseDate(timeRaw, opts.dateOrder, 'appt', now)?.timeMin ?? null;
    if (t === null) problems.push('Start time not readable');
    else startMin = t;
  }
  if (appt && startMin === null && !timeRaw) problems.push('No start time');

  const statusRaw = col('status');
  return {
    rowNumber,
    displayName: displayName || '(no name)',
    firstName: first,
    lastName: last,
    dobIso: dob?.date ?? null,
    mrn: normMrn(col('mrn')),
    phoneKey: phoneKey(col('phone')),
    date: appt?.date ?? null,
    startMin,
    durationMin: parseDuration(col('duration')),
    provider: col('provider'),
    facility: col('facility'),
    visitType: col('visitType'),
    statusRaw,
    category: statusCategory(statusRaw),
    apptId: col('apptId'),
    problems,
  };
}

/** Stable eCW appointment identity: the appointment ID when the report has one, else MRN (or name+DOB) + local date/time + provider. */
export function apptKeyOf(r: NormRow): string | null {
  if (r.apptId) return `id:${r.apptId.trim()}`;
  if (!r.date || r.startMin === null) return null;
  const who = r.mrn ?? (r.lastName && r.dobIso ? `${r.lastName}/${r.firstName ?? ''}/${r.dobIso}` : null);
  if (!who) return null;
  const hhmm = `${String(Math.floor(r.startMin / 60)).padStart(2, '0')}:${String(r.startMin % 60).padStart(2, '0')}`;
  return `k:${who}|${r.date}T${hhmm}|${normProvider(r.provider)}`;
}
