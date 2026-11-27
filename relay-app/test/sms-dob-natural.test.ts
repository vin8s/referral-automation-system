// Natural-language date-of-birth corpus for the R4 identity check (guards.ts normalizeDob / dobMatches).
//
// Goal: a patient can type their birthdate the way people really text it (English and Spanish,
// typos, extra words) and pass; a WRONG date never passes.
//
// Rules the parser follows (and these tests pin down):
//   - US month-first. Day-first is used only when month-first is impossible and day-first is not
//     ("28/02/1981"). "03/04/1980" is always March 4, never April 3.
//   - A full date is needed (day + month + year). "feb 1981", "2/28" → no date.
//   - Two-digit years: 20YY unless that date would be in the future, then 19YY.
//   - A date of birth can't be in the future or more than 125 years ago.
//   - Two or more DIFFERENT dates in one message → no date (no guessing, and one text can't try
//     several dates of birth at once).
// FAKE dates only.

import { describe, expect, it } from 'vitest';
import { dobMatches, normalizeDob, pickDobCandidate, validateModelOutput, validateOutgoing } from '@/server/sms/guards';

// Fixed "today" so the century / future-date rules are deterministic.
const NOW = new Date('2026-11-15T18:00:00Z');
const parse = (s: string) => normalizeDob(s, NOW);
const matches = (s: string, rec: string) => dobMatches(s, rec, NOW);

// ── Renderers ────────────────────────────────────────────────────────────────

const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const EN_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ES_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh',
  'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const enCard = (n: number, sep = '-') => n < 20 ? EN_UNITS[n] : EN_TENS[Math.floor(n / 10)] + (n % 10 ? sep + EN_UNITS[n % 10] : '');
const enOrd = (n: number, sep = '-') => n < 20 ? EN_ORD[n]
  : n % 10 === 0 ? EN_TENS[n / 10].replace(/y$/, 'ieth') : EN_TENS[Math.floor(n / 10)] + sep + EN_ORD[n % 10];
const enYear = (y: number, sep = ' ') => {
  const hi = Math.floor(y / 100), lo = y % 100;
  if (hi === 20) return lo < 10 ? `two thousand ${EN_UNITS[lo]}` : `two thousand ${enCard(lo, sep)}`;
  return `${EN_UNITS[hi]} ${lo === 0 ? 'hundred' : lo < 10 ? `oh ${EN_UNITS[lo]}` : enCard(lo, sep)}`;
};

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const esCard = (n: number) => n < 30 ? ES_UNITS[n] : ES_TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${ES_UNITS[n % 10]}` : '');
const esDay = (n: number) => (n === 1 ? 'primero' : esCard(n));
const esYear = (y: number) => {
  const hi = Math.floor(y / 100), lo = y % 100;
  return (hi === 20 ? 'dos mil' : 'mil novecientos') + (lo ? ` ${esCard(lo)}` : '');
};

const ordSuffix = (d: number) => (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
const p2 = (n: number) => String(n).padStart(2, '0');

interface Rec { iso: string; y: number; m: number; d: number }
const rec = (iso: string): Rec => { const [y, m, d] = iso.split('-').map(Number); return { iso, y, m, d }; };

/** Every unambiguous way to type the date that we expect to pass. */
function positives(r: Rec): string[] {
  const { y, m, d } = r;
  const yy = p2(y % 100), M = String(m), D = String(d), MM = p2(m), DD = p2(d);
  const out: string[] = [];
  // Numeric, month-first, every separator people use (incl. the colon/semicolon typos seen live).
  for (const sep of ['/', '-', '.', ':', ';', ' ', ' / ', '//', ', ', '\\']) {
    out.push(`${M}${sep}${D}${sep}${y}`, `${MM}${sep}${DD}${sep}${y}`, `${M}${sep}${D}${sep}${yy}`, `${MM}${sep}${DD}${sep}${yy}`);
  }
  out.push(`${y}-${MM}-${DD}`, `${y}/${M}/${D}`, `${y}.${MM}.${DD}`, `${MM}${DD}${y}`, `${MM}${DD}${yy}`, `${MM}${DD} ${y}`, `${y}${MM}${DD}`);
  // Day-first only when it can't be read month-first.
  if (d > 12) out.push(`${D}/${M}/${y}`, `${DD}/${MM}/${y}`, `${DD}.${MM}.${y}`, `${DD}-${MM}-${yy}`, `${DD}${MM}${y}`);
  // English month names.
  const fm = EN_MONTHS[m - 1], ab = EN_ABBR[m - 1], Fm = fm[0].toUpperCase() + fm.slice(1);
  out.push(
    `${Fm} ${d} ${y}`, `${Fm} ${d}, ${y}`, `${fm} ${d}${ordSuffix(d)} ${y}`, `${Fm} ${d}${ordSuffix(d)}, '${yy}`,
    `${ab} ${d} ${y}`, `${ab}. ${d} ${y}`, `${ab.toUpperCase()} ${DD} ${y}`, `${ab}-${DD}-${y}`, `${d}-${ab}-${yy}`,
    `${d} ${fm} ${y}`, `${d}${ordSuffix(d)} of ${fm} ${y}`, `the ${d}${ordSuffix(d)} of ${ab} ${y}`, `${y} ${ab} ${d}`,
    `${fm} the ${d}${ordSuffix(d)} ${y}`, `${Fm} ${d} ${yy}`, `${fm}${d} ${y}`,
  );
  // English words.
  out.push(
    `${fm} ${enOrd(d)} ${y}`, `${fm} ${enOrd(d, ' ')} ${enYear(y)}`, `${enCard(d)} ${fm} ${enYear(y)}`,
    `${fm} ${enCard(d, ' ')}, ${enYear(y, '-')}`, `the ${enOrd(d)} of ${fm} ${enYear(y)}`, `${fm} ${d}, ${enYear(y)}`,
  );
  // Spanish.
  const es = ES_MONTHS[m - 1], esa = ES_ABBR[m - 1];
  out.push(
    `${d} de ${es} de ${y}`, `${d} de ${es} del ${y}`, `${es} ${d} ${y}`, `${es} ${d}, ${y}`, `el ${d} de ${esa} del ${yy}`,
    `${d} ${es} ${y}`, `${es[0].toUpperCase()}${es.slice(1)} ${DD} de ${y}`, `${esDay(d)} de ${es} de ${esYear(y)}`,
    `el ${esDay(d)} de ${es} del ${yy}`, `${d} de ${es} del año ${y}`, `${esDay(d)} de ${es} de ${y}`,
  );
  // Wrapped in sentences, emoji, extra spaces, trailing punctuation, other numbers.
  const base = `${M}/${D}/${yy}`;
  out.push(
    `my bday is ${M}-${D}-${yy}`, `its ${M} ${D} ${yy}`, `it's ${base}`, `${M}/${D}/${y}.`, `   ${MM}/${DD}/${y}   `,
    `${base} 🎂`, `🎉🎉 ${fm} ${d} ${y}!!`, `born on the ${d}${ordSuffix(d)} of ${ab} ${y}`, `DOB: ${MM}/${DD}/${y}`,
    `dob ${base} thx`, `I have 2 kids, born ${base}`, `I'm 45, born ${base}`, `Sure! ${MM}/${DD}/${y} thank you`,
    `Es el ${d} de ${es} de ${y}, gracias`, `nací el ${d} de ${es} del ${yy}`, `mi fecha de nacimiento es ${DD}/${MM}/${y}`.replace(
      `${DD}/${MM}/${y}`, d > 12 ? `${DD}/${MM}/${y}` : `${MM}/${DD}/${y}`),
    `(${base})`, `${base} or ${M}/${D}/${y}`, `ok ${M}.${D}.${y}`, `${fm.toUpperCase()} ${d} ${y}`,
    `${MM}/${DD}/${y}\n`, `Hi this is me. ${MM}/${DD}/${y}`,
  );
  // Letter O / l for 0 / 1 (fat fingers on the number row).
  out.push(`${MM}/${DD}/${y}`.replace(/0/g, 'O'), `${MM}/${DD}/${y}`.replace(/1/g, 'l'));
  // Common month misspellings.
  const typo: Record<number, string> = { 1: 'janurary', 2: 'febuary', 3: 'marhc', 4: 'apirl', 8: 'agust', 9: 'septmber', 10: 'octobre', 11: 'novemeber', 12: 'decmber' };
  if (typo[m]) out.push(`${typo[m]} ${d} ${y}`);
  return [...new Set(out)];
}

const RECORDS = ['1981-02-28', '1990-01-15', '1975-11-03', '2001-07-04', '1968-12-31', '2005-09-09', '1999-10-21', '1950-05-01'].map(rec);

/** Hand-written inputs (from the live tests and the brief) for 1981-02-28. */
const HAND_1981 = [
  '2/28/81', '02.28.1981', "Feb 28th, '81", 'february twenty eighth 1981', 'twenty-eight february nineteen eighty one',
  'born on the 28th of feb 1981', 'my bday is 2-28-81', '0228 1981', '02281981', 'Feb. 28 1981', '28/02/1981',
  'O2/28/1981', '2/28/1981.', '  2 / 28 / 1981  ', "it's 2 28 81", '28 de febrero de 1981', 'febrero 28 1981',
  'el 28 de feb del 81', 'I have 2 kids, born 2/28/81', 'February 28, 1981', 'feb 28 1981 💕', 'FEB 28 81',
  '2-28-1981', '2_28_1981', '022881', 'Feb28 1981', '28feb1981', 'february 28th nineteen eighty-one',
  'veintiocho de febrero de mil novecientos ochenta y uno', 'el veintiocho de febrero del ochenta y uno',
  'Feb 28 1981 is my birthday', 'my date of birth is february 28 1981 thanks', 'febuary 28 1981',
  'Its 2/28/81 i think', '2/28/81 (I am 45)', '2/28 1981', 'Febrero 28, 1981', 'el 28 de febrero, 1981',
  '28-feb-1981', '1981-02-28', '1981/2/28', '19810228', '２/２８/１９８１',
];
const HAND_1990 = ['1:15:1990', '1;15;1990', 'jan 15 90', '15 de enero de 1990', 'enero 15 1990', 'january fifteenth, nineteen ninety',
  'quince de enero de mil novecientos noventa', '1-15-90', '011590', '15/01/1990', 'Jan. 15th 1990', '1/15/1990 :)', 'l/l5/l990'];
const HAND_1975 = ['11/3/75', 'nov 3rd 75', '3 de noviembre de 1975', 'tres de noviembre del setenta y cinco', 'november third nineteen seventy five',
  '11-03-1975', 'Nov 3, 1975', 'noviembre 3 1975', '3 nov 1975', '1975-11-03'];

describe('DOB corpus — must pass', () => {
  const cases: [string, string][] = [];
  for (const r of RECORDS) for (const s of positives(r)) cases.push([s, r.iso]);
  for (const s of HAND_1981) cases.push([s, '1981-02-28']);
  for (const s of HAND_1990) cases.push([s, '1990-01-15']);
  for (const s of HAND_1975) cases.push([s, '1975-11-03']);

  it('corpus is big enough', () => expect(cases.length).toBeGreaterThan(200));
  it.each(cases)('%j → %s', (typed, iso) => {
    expect(parse(typed)).toBe(iso);
    expect(matches(typed, iso)).toBe(true);
  });
});

// ── Must never pass ──────────────────────────────────────────────────────────

const shift = (r: Rec, dy: number, dm: number, dd: number): string | null => {
  const dt = new Date(Date.UTC(r.y + dy, r.m - 1 + dm, r.d + dd));
  return dt.toISOString().slice(0, 10);
};

/** Wrong dates written the ways that would pass if they were right. */
function negatives(r: Rec): string[] {
  const wrong = new Set<string>();
  for (const [dy, dm, dd] of [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [10, 0, 0], [-10, 0, 0], [0, 0, 10], [100, 0, 0], [-100, 0, 0]]) {
    const w = shift(r, dy, dm, dd);
    if (w && w !== r.iso) wrong.add(w);
  }
  const out: string[] = [];
  for (const iso of wrong) {
    const w = rec(iso);
    out.push(`${w.m}/${w.d}/${w.y}`, `${EN_MONTHS[w.m - 1]} ${w.d} ${w.y}`, `${w.d} de ${ES_MONTHS[w.m - 1]} de ${w.y}`,
      `${p2(w.m)}${p2(w.d)}${w.y}`);
    // Two-digit year only when it differs from the record's (1881 and 1981 are both "81").
    if (w.y % 100 !== r.y % 100) out.push(`${p2(w.m)}-${p2(w.d)}-${p2(w.y % 100)}`);
  }
  // Month/day swapped, when that is a different valid date: read month-first, so it never matches.
  if (r.d <= 12 && r.d !== r.m) out.push(`${r.d}/${r.m}/${r.y}`, `${p2(r.d)}.${p2(r.m)}.${r.y}`, `${p2(r.d)}${p2(r.m)}${r.y}`);
  // Partial dates.
  out.push(`${EN_MONTHS[r.m - 1]} ${r.y}`, `${r.m}/${r.d}`, `${EN_ABBR[r.m - 1]} ${r.d}`, `${r.y}`, `${r.d}`, `${r.m}/${r.y}`,
    `${r.d} de ${ES_MONTHS[r.m - 1]}`, `${ES_MONTHS[r.m - 1]} del ${r.y}`, `${p2(r.m)}${p2(r.d)}`);
  // Several dates in one text (a guessing list) — never a match even if one is right.
  out.push(`${r.m}/${r.d}/${r.y} or ${r.m}/${r.d + 1 > 28 ? 1 : r.d + 1}/${r.y}`,
    `1/1/1980 1/2/1980 1/3/1980 ${r.m}/${r.d}/${r.y}`, `my son is 3/4/2010 and I'm ${r.m}/${r.d}/${r.y}`);
  return out;
}

const NEG_FIXED: [string, string][] = [
  // Impossible dates.
  ['2/30/1981', '1981-02-28'], ['2/29/1981', '1981-02-28'], ['13/13/1981', '1981-02-28'], ['00/28/1981', '1981-02-28'],
  ['2/0/1981', '1981-02-28'], ['2/32/1981', '1981-02-28'], ['feb 30 1981', '1981-02-28'], ['31 de febrero de 1981', '1981-02-28'],
  ['2/28/2081', '1981-02-28'], ['2/28/1881', '1981-02-28'], ['2/28/981', '1981-02-28'], ['2/28/19811', '1981-02-28'],
  // Other people's dates / unrelated numbers.
  ['3/4/1980', '1981-02-28'], ['my wife is 2/28/82', '1981-02-28'], ['call me at 555-555-0100', '1981-02-28'],
  ['555 228 1981', '1981-02-28'], ['(555) 228 1981', '1981-02-28'], ['(555) 228-1981', '1981-02-28'],
  ['555-228-1981', '1981-02-28'], ['+1 555 228 1981', '1981-02-28'], ['I am 45 years old', '1981-02-28'], ['feb 28', '1981-02-28'], ['1981', '1981-02-28'],
  ['28', '1981-02-28'], ['2 28', '1981-02-28'], ['zip 22881', '1981-02-28'], ['2/28/81 2/28/82', '1981-02-28'],
  ['28/2/1980', '1981-02-28'], ['2/28/1981 3/1/1981', '1981-02-28'], ['', '1981-02-28'], ['   ', '1981-02-28'],
  ['yes', '1981-02-28'], ['🎂🎂🎂', '1981-02-28'], ['february', '1981-02-28'], ['twenty eight', '1981-02-28'],
  ['nineteen eighty one', '1981-02-28'], ['february nineteen eighty one', '1981-02-28'],
  // Ambiguous day-first: read month-first (US). 03/04/1980 is March 4, so it never passes for April 3.
  ['03/04/1980', '1980-04-03'], ['3/4/80', '1980-04-03'], ['03041980', '1980-04-03'], ['3/11/1975', '1975-11-03'],
  ['04.03.1980', '1980-03-04'],
  // Seven / six digit runs that could be two different dates.
  ['1151990', '1990-01-15'], ['1151990', '1990-11-05'], ['121990', '1990-01-02'], ['121990', '1990-12-19'],
  // Century: "20" is 2020 (not 1920) because 2020 is not in the future.
  ['3/4/20', '1920-03-04'],
];

describe('DOB corpus — must never pass', () => {
  const cases: [string, string][] = [...NEG_FIXED];
  for (const r of RECORDS) for (const s of negatives(r)) cases.push([s, r.iso]);
  it('corpus is big enough', () => expect(cases.length).toBeGreaterThan(150));
  it.each(cases)('%j ≠ %s', (typed, iso) => expect(matches(typed, iso)).toBe(false));
});

describe('DOB ambiguity rules', () => {
  it.each([
    ['03/04/1980', '1980-03-04'], ['04/03/1980', '1980-04-03'], ['13/04/1980', '1980-04-13'], ['3/11/1975', '1975-03-11'],
    ['1/2/05', '2005-01-02'], ['1/2/50', '1950-01-02'], ['12/31/26', '1926-12-31'], ['1/2/26', '2026-01-02'],
    ['121990', null], ['1151990', null], ['2281981', null], ['228 1981', null], ['2/28/81 or 2/27/81', null], ['2/28/81 and february 28 1981', '1981-02-28'],
  ] as [string, string | null][])('%j → %s', (typed, iso) => expect(parse(typed)).toBe(iso));
});

describe('identity candidate (code first, model fallback)', () => {
  it('code parse of the patient text wins over the model', () => {
    expect(pickDobCandidate('1:15:1990', '1990-01-16', NOW)).toBe('1990-01-15');
    expect(pickDobCandidate('febrero 28 1981', null, NOW)).toBe('1981-02-28');
  });
  it('falls back to the model when code finds no single date', () => {
    expect(pickDobCandidate('the day after valentines, 81', '1981-02-15', NOW)).toBe('1981-02-15');
    expect(pickDobCandidate('hello', null, NOW)).toBeNull();
    expect(pickDobCandidate('hello', 'not a date', NOW)).toBeNull();
  });
});

describe('model output: dob_candidate in an odd format', () => {
  const base = () => ({
    reply_text: null, use_template: null, language: 'en', language_switch_request: null, intent: 'identity_response',
    identity: { dob_candidate: null as string | null, says_not_patient: false, says_is_proxy: false },
    captured_slot: null, preferences: null, friction: [],
    escalation: { tier: 'none', reason_code: null, pause_automation: false, staff_summary: null },
    opt_out: false, help_requested: false, wrong_number: false, call_outcome: null, conversation_complete: false,
  });
  it('a parseable non-ISO value is normalized, not rejected', () => {
    const o = base(); o.identity.dob_candidate = '02/28/1981';
    const v = validateModelOutput(o);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.output.identity.dob_candidate).toBe('1981-02-28');
  });
  it('an unparseable value is still an error', () => {
    const o = base(); o.identity.dob_candidate = 'sometime in feb';
    expect(validateModelOutput(o).ok).toBe(false);
  });
});

describe('outbound guard catches the DOB in any format', () => {
  const ctx = { clinicPhone: '(555) 555-0123', dobIso: '1981-02-28', sensitiveText: '', offeredSlots: [], identityVerified: true };
  it.each(['Thanks! We have Feb 28, 1981 on file.', 'Got it: 28 de febrero de 1981.', 'DOB 2.28.81 confirmed'])('%j', text =>
    expect(validateOutgoing(text, ctx)).toContain('date of birth'));
});

describe('parser never throws (fuzz)', () => {
  // Small deterministic PRNG so failures reproduce.
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ALPH = ['0', '1', '2', '9', '/', '-', '.', ':', ' ', 'o', 'l', 'feb', 'de', 'twenty', 'nineteen', 'mil', 'y', 'and',
    'oh', '\u0000', '\uD800', '\uDFFF', '😀', 'ñ', 'é', '́', 'º', '２', '\n', "'", 'th', 'st', 'thousand', 'hundred', 'cien'];
  it('random token soup, random unicode, very long strings', () => {
    for (let i = 0; i < 4000; i++) {
      const n = Math.floor(rnd() * 40);
      let s = '';
      for (let k = 0; k < n; k++) {
        s += rnd() < 0.7 ? ALPH[Math.floor(rnd() * ALPH.length)] : String.fromCharCode(Math.floor(rnd() * 0xffff));
        if (rnd() < 0.5) s += ' ';
      }
      expect(() => normalizeDob(s, NOW)).not.toThrow();
      expect(() => dobMatches(s, '1981-02-28', NOW)).not.toThrow();
      const r = normalizeDob(s, NOW);
      expect(r === null || /^\d{4}-\d{2}-\d{2}$/.test(r)).toBe(true);
    }
    for (const s of ['9'.repeat(100_000), '2/28/81 '.repeat(5000), 'twenty '.repeat(20_000), 'mil '.repeat(20_000),
      '/'.repeat(50_000), '\uD800'.repeat(1000), 'o'.repeat(50_000) + '1']) {
      expect(() => normalizeDob(s, NOW)).not.toThrow();
    }
    for (const v of [undefined, null, 0, 19810228, {}, [], NaN] as unknown[]) {
      expect(() => normalizeDob(v as string, NOW)).not.toThrow();
    }
  });
});
