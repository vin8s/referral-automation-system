// Code-side safety guards for the SMS agent (AGENT_SAFETY_RULES §0). Pure functions.
//
//   detectKeyword      R6.2  exact STOP / HELP / START keywords (EN + ES)
//   detectEmergency    R1    emergency/crisis phrase backstop (runs even when opted out)
//   validateModelOutput      schema + code-side checks from SMS_AGENT_PROMPT §4
//   validateOutgoing         outbound guard on AI-written text
//   resolveDecision          precedence red > opt_out > wrong_number > amber > captured_slot > reply_text
//   normalizeDob / dobMatches / pickDobCandidate  R4 identity check (code parses and compares; the model never sees the DOB)

import 'server-only';
import { measureSms } from './segments';
import type { Lang } from './templates';

/** The AI aims for 300 characters (2 SMS segments) but may go a little over: up to 3 segments is sent. */
export const MAX_SEGMENTS = 3;
/** 3 GSM-7 segments = 3 × 153 characters. */
export const MAX_REPLY_CHARS = 459;
import {
  AMBER_CODES, CALL_OUTCOMES, INTENTS, MODEL_TEMPLATES, RED_CODES,
  type OfferedSlot, type RedCode, type SmsTurnOutput,
} from './types';

// ── Text normalization ──────────────────────────────────────────────────────

/** Lowercase, accents stripped, apostrophes removed, whitespace collapsed. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9ñ\s/:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── R6.2 keywords ───────────────────────────────────────────────────────────

export type KeywordAction = 'opt_out' | 'help' | 'opt_in';

const KEYWORDS: Record<string, { action: KeywordAction; lang: Lang | null }> = {
  stop: { action: 'opt_out', lang: 'en' }, stopall: { action: 'opt_out', lang: 'en' },
  unsubscribe: { action: 'opt_out', lang: 'en' }, cancel: { action: 'opt_out', lang: 'en' },
  end: { action: 'opt_out', lang: 'en' }, quit: { action: 'opt_out', lang: 'en' },
  optout: { action: 'opt_out', lang: 'en' }, revoke: { action: 'opt_out', lang: 'en' },
  alto: { action: 'opt_out', lang: 'es' }, parar: { action: 'opt_out', lang: 'es' },
  pare: { action: 'opt_out', lang: 'es' }, basta: { action: 'opt_out', lang: 'es' },
  cancelar: { action: 'opt_out', lang: 'es' }, baja: { action: 'opt_out', lang: 'es' },
  detener: { action: 'opt_out', lang: 'es' },
  help: { action: 'help', lang: 'en' }, info: { action: 'help', lang: 'en' },
  ayuda: { action: 'help', lang: 'es' },
  start: { action: 'opt_in', lang: null }, unstop: { action: 'opt_in', lang: null },
  iniciar: { action: 'opt_in', lang: 'es' },
};

/** Whole-message keyword match: trimmed, case-insensitive, punctuation and accents ignored. */
export function detectKeyword(body: string): { action: KeywordAction; keyword: string; lang: Lang | null } | null {
  const k = body.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const hit = KEYWORDS[k];
  return hit ? { ...hit, keyword: k.toUpperCase() } : null;
}

// ── R1 emergency / crisis backstop ──────────────────────────────────────────
// High-precision phrases describing something happening NOW. Bare topic words
// ("chest pain", "stroke") are left to the AI so a past mention ("the chest
// pain I had last year") stays amber (CONVERSATION_TEST_CASES #22). The AI is
// the main detector; this list only forces red when it is unmistakable.

const RED_PATTERNS: [RedCode, RegExp][] = [
  // Suicide / self-harm (checked first: crisis_reply, not emergency_reply)
  ['suicide_self_harm', /\b(kill|hurt|cut|cutting) ?my ?self\b|\bkms\b|\bunalive\b|\bsuicid|\bbetter off dead\b|\b(want|wanna|going|gonna) (to )?die\b|\bdont want to (live|be alive|be here)( anymore)?\b|\bno reason to live\b|\bend(ing)? (my life|it all)\b/],
  ['suicide_self_harm', /\bme quiero (morir|matar)\b|\bquiero (morir|matarme)\b|\bquitarme la vida\b|\bya no quiero (vivir|estar aqui)\b|\bestarian mejor sin mi\b|\bme voy a hacer dano\b|\bme estoy cortando\b|\bya no voy a estar aqui\b/],
  // Indirect hopelessness (sim persona crisis_indirect): the model sometimes rated these amber.
  ['suicide_self_harm', /\b(dont|do not|cant|can not|cannot) see (the |any )?point (of|in) (any of this|anything|living|life|going on)( anymore)?\b|\bno point (in )?(living|going on|anymore)\b|\bnothing (is going|is gonna|will ever|will) (to )?get better\b|\bcant (go on|do this) anymore\b|\b(everyone|they|my family)( would be| is| are)? better off without me\b|\bwhats the point of (living|going on|anything)\b/],
  ['suicide_self_harm', /\bno le veo (el )?sentido a (nada|la vida|vivir)\b|\bya no (aguanto|puedo mas)\b|\bnada va a mejorar\b|\bno vale la pena vivir\b|\bestarian mejor sin mi\b/],
  // Overdose / poisoning
  ['overdose_poisoning', /\b(overdos\w*|took (too many|a lot of|all (of )?my|the whole bottle|like \d+|\d+ of my)\b.*\b(pills?|meds|medicine|tablets)|took the whole bottle|swallowed (bleach|chemicals|poison|pills)|(kid|child|baby|son|daughter) swallowed)/],
  ['overdose_poisoning', /\b(muchas pastillas|sobredosis|todo el frasco|tome (cloro|quimicos|veneno)|se trago (algo|pastillas|cloro))\b/],
  // Violence / danger
  ['violence_danger', /\b(someone|somebody|he|she|they)( is| are|s)? (hurting|beating|hitting|choking) me\b|\bnot safe (at home|here)\b|\b(going to|gonna) (hurt|kill) (me|someone|somebody|him|her|them)\b|\bbeing threatened\b|\bthreatening (to kill )?me\b/],
  ['violence_danger', /\bme (esta|estan) (pegando|golpeando|amenazando)\b|\bme pega\b|\bno estoy segur[oa] en mi casa\b|\bme va a (hacer dano|matar)\b|\bvoy a (lastimar|matar) a alguien\b|\bmaltratando a\b/],
  // Medical emergency
  ['emergency_medical', /\b(cant|can not|cannot|could not|couldnt) (breathe|catch my breath)\b|\bhard to breathe\b|\bshort of breath\b|\bchoking\b|\bchest (really |is |feels )?(hurts?|hurting|tight|heavy)\b|\bpressure in my chest\b|\bchest pain.{0,40}(right now|now|today|this morning|again|came back|is back)\b|\b(having|have) (a )?(heart attack|stroke)\b|\bface (is |feels )?(drooping|numb)\b|\bnumb on one side\b|\bone side (of my (face|body) )?(is )?(numb|weak)\b|\bcant move my (arm|leg)\b|\bslurred speech\b|\bwords (are|r) coming out (weird|wrong|funny)\b|\bworst headache\b|\bpassed out\b|\bfainted\b|\bseizure\b|\bunconscious\b|\b(wont|will not|isnt|not) wak(e|ing) up\b|\bbleeding (a lot|heavily|badly)\b|\bwont stop bleeding\b|\b(coughing|throwing up|vomiting) (up )?blood\b|\bthroat (is )?closing\b|\blips (are )?swelling\b|\bwater broke\b|\bbaby (is )?not moving\b|\b(need|call) an ambulance\b|\bthis is an emergency\b|\b(i think )?im dying\b/],
  ['emergency_medical', /\bme duele (mucho )?el pecho\b|\bpecho apretado\b|\b(presion|opresion) en el pecho\b|\bno puedo respirar\b|\bme falta el aire\b|\bme ahogo\b|\bse me cierra la garganta\b|\bse me durmio\b|\bboca chueca\b|\barrastro las palabras\b|\bhablo raro\b|\bpeor dolor de cabeza\b|\bme desmaye\b|\bse desmayo\b|\bconvulsion\b|\bno despierta\b|\bsangrando mucho\b|\bno para la sangre\b|\b(vomito|toso|vomitando|tosiendo) sangre\b|\bse me hinchan los labios\b|\bembarazada y (estoy )?sangrando\b|\bse me rompio la fuente\b|\bel bebe no se mueve\b|\bcuello rigido\b|\bme pegue en la cabeza\b|\bnecesito una ambulancia\b|\bes una emergencia\b|\bsiento que me muero\b|\b(infarto|derrame)\b/],
];

export function detectEmergency(body: string): { code: RedCode } | null {
  const t = normalizeText(body);
  for (const [code, re] of RED_PATTERNS) if (re.test(t)) return { code };
  return null;
}

export function redTemplateFor(code: RedCode): 'emergency_reply' | 'crisis_reply' {
  return code === 'suicide_self_harm' ? 'crisis_reply' : 'emergency_reply';
}

// ── R4 identity ─────────────────────────────────────────────────────────────
//
// normalizeDob turns what a patient typed into ONE date (YYYY-MM-DD) or null. Deterministic, no
// dependencies, never throws. Rules:
//   - US month-first. Day-first only when month-first is impossible and day-first is not
//     ("28/02/1981" → Feb 28). "03/04/1980" is always March 4, never April 3.
//   - A full date is needed: day, month and year. "feb 1981", "2/28" → null.
//   - Two-digit years: 20YY, unless that date would be in the future, then 19YY ("81" → 1981, "05" → 2005).
//   - A date of birth can't be in the future or more than 125 years ago.
//   - Two or more DIFFERENT dates in one text → null: no guessing, and one text can't try several DOBs.
//   - Understands: separators / - . : ; , \ | _ and spaces; 8- and 6-digit runs (02281981, 19810228,
//     022881); "0228 1981"; month names, abbreviations and common typos (EN + ES); ordinals (28th, 3rd,
//     1ro); spelled-out numbers ("twenty eighth", "nineteen eighty one", "mil novecientos ochenta y uno");
//     letter O / l / I typed for 0 / 1; full-width digits; emoji and extra words around the date.
//   - Not accepted on purpose (phone-number shaped or ambiguous): 7-digit runs ("2281981"),
//     "228 1981", 5-digit runs, four or more bare numbers in a row ("45 2 28 81").

const MONTH_NAMES: [string, number][] = [
  ['january', 1], ['enero', 1], ['february', 2], ['febrero', 2], ['march', 3], ['marzo', 3], ['april', 4], ['abril', 4],
  ['may', 5], ['mayo', 5], ['june', 6], ['junio', 6], ['july', 7], ['julio', 7], ['august', 8], ['agosto', 8],
  ['september', 9], ['septiembre', 9], ['setiembre', 9], ['october', 10], ['octubre', 10], ['november', 11],
  ['noviembre', 11], ['december', 12], ['diciembre', 12],
];
/** Misspellings too short or too far off for the edit-distance rule. */
const MONTH_TYPOS: Record<string, number> = {
  febuary: 2, feburary: 2, febrary: 2, febraury: 2, februrary: 2, ferbuary: 2, febero: 2, febreo: 2, ferero: 2,
  janurary: 1, janaury: 1, marhc: 3, apirl: 4, aprl: 4, agust: 8, augst: 8, agoto: 8, setember: 9, septmber: 9,
  sepember: 9, ocotber: 10, novemeber: 11, novembre: 11, decmber: 12, decemeber: 12, deciembre: 12,
};

/** Damerau-Levenshtein distance ≤ 1 (one insert, delete, substitute or swap). */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function monthOf(w: string): number | null {
  if (w.length < 3) return null;
  if (MONTH_TYPOS[w]) return MONTH_TYPOS[w];
  for (const [name, n] of MONTH_NAMES) if (name.startsWith(w)) return n; // "feb", "sept", "febr", "dic"
  if (w.length >= 6) for (const [name, n] of MONTH_NAMES) if (name.length >= 6 && within1(w, name)) return n;
  return null;
}

// Number words. kind: unit 0-9, teen 10-19, tens 20..90, comp (Spanish 21-29, complete), hund ("hundred"),
// hunds (Spanish 100..900), thou ("thousand", "mil"). ord = ordinal (ends the number).
type NumKind = 'unit' | 'teen' | 'tens' | 'comp' | 'hund' | 'hunds' | 'thou';
const NUM_WORDS: Record<string, [number, NumKind, boolean?]> = {};
const addWords = (kind: NumKind, list: string, ord = false) => {
  for (const pair of list.trim().split(/\s+/)) {
    const [w, v] = pair.split('=');
    NUM_WORDS[w] = [Number(v), kind, ord];
  }
};
addWords('unit', 'zero=0 one=1 two=2 three=3 four=4 five=5 six=6 seven=7 eight=8 nine=9 cero=0 uno=1 dos=2 tres=3 cuatro=4 cinco=5 seis=6 siete=7 ocho=8 nueve=9');
addWords('unit', 'first=1 second=2 third=3 fourth=4 forth=4 fifth=5 fith=5 sixth=6 seventh=7 eighth=8 eigth=8 ninth=9 nineth=9 primero=1 primer=1', true);
addWords('teen', 'ten=10 eleven=11 twelve=12 thirteen=13 fourteen=14 fifteen=15 sixteen=16 seventeen=17 eighteen=18 nineteen=19 ninteen=19 diez=10 dies=10 once=11 doce=12 trece=13 catorce=14 quince=15 dieciseis=16 diecisiete=17 dieciocho=18 diecinueve=19');
addWords('teen', 'tenth=10 eleventh=11 twelfth=12 twelth=12 thirteenth=13 fourteenth=14 fifteenth=15 sixteenth=16 seventeenth=17 eighteenth=18 nineteenth=19 ninteenth=19', true);
addWords('tens', 'twenty=20 thirty=30 forty=40 fourty=40 fifty=50 sixty=60 seventy=70 eighty=80 eigthy=80 ninety=90 nintey=90 veinte=20 beinte=20 treinta=30 cuarenta=40 cincuenta=50 sesenta=60 setenta=70 ochenta=80 noventa=90');
addWords('tens', 'twentieth=20 thirtieth=30', true);
for (const [i, u] of ['un', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'].entries()) {
  for (const p of ['veinti', 'venti', 'beinti']) NUM_WORDS[p + u] = [i === 0 ? 21 : 20 + i, 'comp'];
}
addWords('hund', 'hundred=100');
addWords('hunds', 'cien=100 ciento=100 doscientos=200 trescientos=300 cuatrocientos=400 quinientos=500 seiscientos=600 setecientos=700 ochocientos=800 novecientos=900');
addWords('thou', 'thousand=1000 mil=1000');
const CONNECTORS = new Set(['and', 'y']);
const OH = new Set(['oh', 'o']);
const ORD_SUFFIX = new Set(['st', 'nd', 'rd', 'th', 'ro', 'ero', 'er', 'do', 'to', 'vo', 'no', 'mo', 'avo']);
const FILLERS = new Set(['of', 'the', 'de', 'del', 'el', 'year', 'ano']);

interface Num { v: number; s: string; ord?: boolean; word?: boolean }

/** Spelled-out numbers → values. "twenty eighth nineteen eighty one" → [28, 1981]. */
function wordsToNums(words: string[]): Num[] {
  const out: (Num & { teenOrTens?: boolean })[] = [];
  let total = 0, cur = 0, has = false, last: NumKind | 'oh' | null = null, oh = false;
  const flush = () => {
    if (has) {
      const v = total + cur;
      out.push({ v, s: oh ? String(v).padStart(2, '0') : String(v), word: true, teenOrTens: total === 0 && (last === 'teen' || last === 'tens') });
    }
    total = 0; cur = 0; has = false; last = null; oh = false;
  };
  for (const w of words) {
    if (CONNECTORS.has(w)) continue; // only kept between number words that fit together
    if (OH.has(w)) { flush(); has = true; oh = true; last = 'oh'; continue; }
    const hit = NUM_WORDS[w];
    if (!hit) { flush(); continue; }
    const [v, kind, ord] = hit;
    const afterBig = has && (last === 'hund' || last === 'hunds' || last === 'thou');
    switch (kind) {
      case 'unit':
        if (has && (last === 'oh' || afterBig || (last === 'tens' && cur % 10 === 0))) cur += v;
        else { flush(); cur = v; has = true; }
        break;
      case 'teen': case 'tens': case 'comp':
        if (afterBig && cur % 100 === 0) cur += v;
        else { flush(); cur = v; has = true; }
        break;
      case 'hund':
        if (has && last !== 'hund' && last !== 'hunds' && cur >= 1 && cur <= 99) cur *= 100;
        else { flush(); cur = 100; has = true; }
        break;
      case 'hunds':
        if (has && last === 'thou') cur += v;
        else { flush(); cur = v; has = true; }
        break;
      case 'thou':
        if (has && total === 0 && last !== 'thou' && cur >= 1 && cur <= 999) { total = cur * 1000; cur = 0; }
        else { flush(); total = 1000; has = true; }
        break;
    }
    last = kind;
    if (ord) { const before = out.length; flush(); if (out.length > before) out[out.length - 1].ord = true; }
  }
  flush();
  // "nineteen eighty one" → [19, 81] → 1981; "twenty ten" → 2010. Right to left, so
  // "february twenty nineteen ninety" is Feb 20, 1990.
  const merged: Num[] = [];
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i], l = out[i - 1];
    if (l && (l.v === 19 || l.v === 20) && l.teenOrTens && !l.ord && !r.ord && r.v <= 99 && (r.v >= 10 || r.s.length === 2)) {
      merged.unshift({ v: l.v * 100 + r.v, s: String(l.v * 100 + r.v), word: true });
      i--;
    } else merged.unshift(r);
  }
  return merged;
}

type Gap = 'none' | 'weak' | 'strong' | 'hard';
function gapOf(g: string): Gap {
  if (g === '') return 'none';
  const core = g.replace(/\s+/g, '');
  if (core === '') return 'weak';
  if ((core === '.' || core === ',') && /\s/.test(g)) return 'weak'; // "Feb. 28", "28, 1981"
  if (/^[/\\.:;,|_~-]{1,2}$/.test(core)) return 'strong';
  return 'hard';
}

/** Lowercase ASCII text with typos for digits fixed. */
function prepare(input: string): string {
  let s = input.slice(0, 2000).replace(/[º°ª]/g, ' ');
  s = s.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[’‘´`]/g, "'").replace(/[^\x00-\x7f]/g, ' ');
  s = s.replace(/(?<=[a-z])'(?=[a-z])/g, '').replace(/'/g, ' '); // "it's" → "its", "'81" → " 81"
  // Letter O / l / I inside a number: "O2/28/1981", "l981". "1o de mayo" is Spanish "1º".
  s = s.replace(/(?<![a-z])[0-9oil]*\d[0-9oil]*(?![a-z])/g, (m, off: number) => {
    if (!/[oil]/.test(m)) return m;
    if (/^\d{1,2}o$/.test(m) && /^\s*de\b/.test(s.slice(off + m.length))) return m.slice(0, -1);
    return m.replace(/o/g, '0').replace(/[il]/g, '1');
  });
  // A lone O / l / I next to a separated number: "l/15/1990", "O1/O1".
  s = s.replace(/(?<![a-z\d])[oil]{1,4}(?=[/\-.:;]\d)|(?<=\d[/\-.:;])[oil]{1,4}(?![a-z\d])/g, m => m.replace(/o/g, '0').replace(/[il]/g, '1'));
  return s;
}

type Item = { t: 'num'; n: Num; gap: Gap } | { t: 'mon'; v: number; gap: Gap } | { t: 'fill'; gap: Gap } | { t: 'brk' };

function itemsOf(s: string): Item[] {
  const toks: { s: string; digit: boolean; gap: Gap; raw: string }[] = [];
  let end = 0;
  for (const m of s.matchAll(/[a-z]+|\d+/g)) {
    const at = m.index ?? 0;
    const raw = s.slice(end, at);
    toks.push({ s: m[0], digit: /^\d/.test(m[0]), gap: gapOf(raw), raw });
    end = at + m[0].length;
  }
  const items: Item[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.digit) {
      items.push({ t: 'num', n: { v: tk.s.length <= 8 ? Number(tk.s) : -1, s: tk.s }, gap: tk.gap });
      continue;
    }
    if (tk.gap === 'none' && i > 0 && toks[i - 1].digit && ORD_SUFFIX.has(tk.s)) continue; // 28th, 3rd, 1ro
    if (NUM_WORDS[tk.s]) {
      // Collect the spelled-out number: number words joined by spaces or hyphens.
      const words = [tk.s];
      let j = i + 1;
      for (; j < toks.length; j++) {
        const t = toks[j];
        if (t.digit || !(t.gap === 'weak' || t.raw.trim() === '-')) break; // twenty-eight
        const next = toks[j + 1];
        if (NUM_WORDS[t.s]) { words.push(t.s); continue; }
        const nextIsNum = !!next && !next.digit && !!NUM_WORDS[next.s] && next.gap !== 'hard';
        if (CONNECTORS.has(t.s) && nextIsNum) { words.push(t.s); continue; }
        if (OH.has(t.s) && nextIsNum && NUM_WORDS[next.s][1] === 'unit') { words.push(t.s); continue; }
        break;
      }
      const nums = wordsToNums(words);
      nums.forEach((n, k) => items.push({ t: 'num', n, gap: k === 0 ? tk.gap : 'weak' }));
      i = j - 1;
      continue;
    }
    const mon = monthOf(tk.s);
    if (mon) { items.push({ t: 'mon', v: mon, gap: tk.gap }); continue; }
    if (FILLERS.has(tk.s)) { items.push({ t: 'fill', gap: tk.gap }); continue; }
    items.push({ t: 'brk' });
  }
  return items;
}

type Seg = { k: 'g'; n: Num[]; gap: Gap } | { k: 'm'; v: number; gap: Gap };

/** Runs of numbers / month names with only separators or filler words ("de", "of", "the") between them. */
function runsOf(items: Item[]): Seg[][] {
  const runs: Seg[][] = [];
  let run: Seg[] = [];
  let viaFiller = false;
  const close = () => { if (run.length) runs.push(run); run = []; viaFiller = false; };
  for (const it of items) {
    if (it.t === 'brk') { close(); continue; }
    if (it.gap === 'hard') close();
    if (it.t === 'fill') { viaFiller = true; continue; }
    const gap: Gap = viaFiller || it.gap === 'none' ? 'weak' : it.gap;
    viaFiller = false;
    const prev = run[run.length - 1];
    if (it.t === 'num' && prev?.k === 'g' && gap === 'strong') prev.n.push(it.n);
    else run.push(it.t === 'num' ? { k: 'g', n: [it.n], gap } : { k: 'm', v: it.v, gap });
  }
  close();
  return runs;
}

function todayIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/** A real, past date within 125 years, or null. yLen 2 → 20YY unless that is in the future, then 19YY. */
function mk(y: number, yLen: number, m: number, d: number, now: Date): string | null {
  if (![y, m, d].every(Number.isInteger) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (yLen === 2) {
    if (y < 0 || y > 99) return null;
    return mk(2000 + y, 4, m, d, now) ?? mk(1900 + y, 4, m, d, now);
  }
  if (yLen !== 4) return null;
  const nowY = now.getUTCFullYear();
  if (y < nowY - 125 || y > nowY) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const out = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return out <= todayIso(now) ? out : null;
}

const isDay = (n: Num) => n.s.length <= 2 && n.v >= 1 && n.v <= 31;
const isYear = (n: Num) => n.s.length === 2 || n.s.length === 4;

/** Month-first; day-first only if month-first is impossible and the first number is 13-31. */
function mdy(a: number, b: number, y: number, yLen: number, now: Date, dayFirstOk = true): string | null {
  return mk(y, yLen, a, b, now) ?? (dayFirstOk && a > 12 && b <= 12 ? mk(y, yLen, b, a, now) : null);
}

function triple(n: Num[], now: Date): string | null {
  const [a, b, c] = n;
  if (a.s.length === 4 && b.s.length <= 2 && c.s.length <= 2) return mk(a.v, 4, b.v, c.v, now); // 1981-02-28
  if (a.s.length <= 2 && b.s.length <= 2 && isYear(c)) return mdy(a.v, b.v, c.v, c.s.length, now);
  return null;
}

/** "02281981", "19810228", "022881": accepted only when exactly one reading is a valid date. */
function compact(s: string, now: Date): string | null {
  const n = (i: number, j: number) => Number(s.slice(i, j));
  const reads = s.length === 8 ? [mdy(n(0, 2), n(2, 4), n(4, 8), 4, now), mk(n(0, 4), 4, n(4, 6), n(6, 8), now)]
    : s.length === 6 ? [mdy(n(0, 2), n(2, 4), n(4, 6), 2, now), mk(n(2, 6), 4, n(0, 1), n(1, 2), now)]
    : [];
  const found = new Set(reads.filter((r): r is string => !!r));
  return found.size === 1 ? [...found][0] : null;
}

function datesInRun(segs: Seg[], now: Date, found: Set<string>) {
  const add = (r: string | null) => { if (r) found.add(r); };
  const g1 = (s: Seg | undefined): Num | null => (s?.k === 'g' && s.n.length === 1 ? s.n[0] : null);
  // A run that is only bare numbers: "2 28 81", "0228 1981", "02281981".
  if (segs.every(s => s.k === 'g' && s.n.length === 1)) {
    const n = segs.map(s => (s as { n: Num[] }).n[0]);
    if (n.length === 3 && segs[1].gap === segs[2].gap) add(triple(n, now));
    else if (n.length === 2 && n[0].s.length === 4 && isYear(n[1])) add(mdy(Number(n[0].s.slice(0, 2)), Number(n[0].s.slice(2)), n[1].v, n[1].s.length, now));
    else if (n.length === 1) add(compact(n[0].s, now));
    return;
  }
  for (let i = 0; i < segs.length;) {
    const a = segs[i], b = segs[i + 1], c = segs[i + 2];
    if (a.k === 'm') {
      // feb 28 1981 · feb-28-1981 · febrero 28 de 1981
      if (b?.k === 'g' && b.n.length === 2 && isDay(b.n[0]) && isYear(b.n[1])) { add(mk(b.n[1].v, b.n[1].s.length, a.v, b.n[0].v, now)); i += 2; continue; }
      const d = g1(b), y = g1(c);
      if (d && y && isDay(d) && isYear(y)) { add(mk(y.v, y.s.length, a.v, d.v, now)); i += 3; continue; }
      i++; continue;
    }
    if (a.n.length === 3) { add(triple(a.n, now)); i++; continue; }
    if (a.n.length === 2) {
      // 2/28 1981
      const y = g1(b);
      if (a.n[0].s.length <= 2 && a.n[1].s.length <= 2 && y && y.s.length === 4 && b!.gap === 'weak') {
        add(mdy(a.n[0].v, a.n[1].v, y.v, 4, now)); i += 2; continue;
      }
      i++; continue;
    }
    if (a.n.length > 3) { i++; continue; } // phone numbers and other long strings
    const x = a.n[0];
    if (b?.k === 'm') {
      const z = g1(c);
      // 28 feb 1981 · 28 de febrero de 1981 · 28-feb-81
      if (z && isDay(x) && isYear(z)) { add(mk(z.v, z.s.length, b.v, x.v, now)); i += 3; continue; }
      // 1981 feb 28
      if (z && x.s.length === 4 && isDay(z)) { add(mk(x.v, 4, b.v, z.v, now)); i += 3; continue; }
    }
    i++;
  }
}

/** Every distinct date in the text (see the rules above). */
function datesIn(input: unknown, now: Date): string[] {
  if (typeof input !== 'string' || !input) return [];
  try {
    const found = new Set<string>();
    for (const run of runsOf(itemsOf(prepare(input)))) datesInRun(run, now, found);
    return [...found];
  } catch {
    return []; // never throw on patient text
  }
}

/** Parses a typed date of birth into YYYY-MM-DD, or null if there is no single, real, past date. */
export function normalizeDob(input: string | null | undefined, now: Date = new Date()): string | null {
  const found = datesIn(input, now);
  return found.length === 1 ? found[0] : null;
}

/** Code-side identity comparison (R4.2). Both values are normalized; null never matches. */
export function dobMatches(candidate: string | null | undefined, recordIso: string | null | undefined, now: Date = new Date()): boolean {
  const a = normalizeDob(candidate ?? null, now);
  const b = normalizeDob(recordIso ?? null, now);
  return !!a && !!b && a === b;
}

/**
 * The one date of birth to check for this message: code's parse of the patient's own text first,
 * the model's extraction only when code finds no single date. One guess per message.
 */
export function pickDobCandidate(patientText: string | null | undefined, modelCandidate: string | null | undefined, now: Date = new Date()): string | null {
  return normalizeDob(patientText, now) ?? normalizeDob(modelCandidate, now);
}

// ── Model output validation (schema + code-side) ────────────────────────────

const oneOf = <T extends readonly unknown[]>(list: T, v: unknown): v is T[number] => list.includes(v as T[number]);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/**
 * Validates the model's JSON against the schema in SMS_AGENT_PROMPT.md §4 plus
 * the code-side rules. Returns a normalized output or the list of problems.
 * Red with a wrong template is repaired (code always sends the right red template).
 */
export function validateModelOutput(raw: unknown): { ok: true; output: SmsTurnOutput } | { ok: false; errors: string[] } {
  const e: string[] = [];
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['not an object'] };

  if (!isStrOrNull(o.reply_text)) e.push('reply_text');
  else if (typeof o.reply_text === 'string' && o.reply_text.length > MAX_REPLY_CHARS) e.push('reply_text too long');
  if (!(o.use_template === null || oneOf(MODEL_TEMPLATES, o.use_template))) e.push('use_template');
  if (!oneOf(['en', 'es'] as const, o.language)) e.push('language');
  if (!(o.language_switch_request === null || oneOf(['en', 'es'] as const, o.language_switch_request))) e.push('language_switch_request');
  // An unknown intent label is not worth failing the turn (sim: "distress_non_emergency" as intent);
  // routing comes from escalation, which is still validated strictly.
  if (!oneOf(INTENTS, o.intent)) o.intent = 'other';

  const id = o.identity as Record<string, unknown> | null;
  if (!id || typeof id !== 'object') e.push('identity');
  else {
    // A date in another format ("02/28/1981") is normalized by code instead of failing the whole turn.
    if (typeof id.dob_candidate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(id.dob_candidate)) {
      id.dob_candidate = normalizeDob(id.dob_candidate) ?? id.dob_candidate;
    }
    if (!(id.dob_candidate === null || (typeof id.dob_candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(id.dob_candidate)))) e.push('identity.dob_candidate');
    if (!isBool(id.says_not_patient) || !isBool(id.says_is_proxy)) e.push('identity flags');
  }

  const cs = o.captured_slot as Record<string, unknown> | null;
  if (cs !== null && (typeof cs !== 'object' || typeof cs?.slot_id !== 'string' || typeof cs?.patient_text !== 'string')) e.push('captured_slot');

  const pr = o.preferences as Record<string, unknown> | null;
  if (pr !== null && (typeof pr !== 'object' || !Array.isArray(pr?.days) || !Array.isArray(pr?.times_of_day) || !isStrOrNull(pr?.notes))) e.push('preferences');
  if (!Array.isArray(o.friction)) e.push('friction');

  const es = o.escalation as Record<string, unknown> | null;
  if (!es || typeof es !== 'object') e.push('escalation');
  else {
    if (!oneOf(['none', 'amber', 'red'] as const, es.tier)) e.push('escalation.tier');
    if (!isBool(es.pause_automation)) e.push('escalation.pause_automation');
    if (!isStrOrNull(es.staff_summary)) e.push('escalation.staff_summary');
    if (es.tier === 'red' && !oneOf(RED_CODES, es.reason_code)) e.push('red needs a red reason_code');
    if (es.tier === 'amber' && !oneOf(AMBER_CODES, es.reason_code)) e.push('amber needs an amber reason_code');
    if (es.tier === 'none' && es.reason_code !== null) e.push('tier none needs reason_code null');
  }
  for (const k of ['opt_out', 'help_requested', 'wrong_number', 'conversation_complete']) if (!isBool(o[k])) e.push(k);
  if (!(o.call_outcome === null || oneOf(CALL_OUTCOMES, o.call_outcome))) e.push('call_outcome');

  if (e.length) return { ok: false, errors: e };
  const out = o as unknown as SmsTurnOutput;
  if (out.escalation.tier === 'red') {
    out.use_template = redTemplateFor(out.escalation.reason_code as RedCode);
    out.reply_text = null;
  }
  return { ok: true, output: out };
}

// ── Outbound guard (AI-written text only) ───────────────────────────────────

export interface OutgoingContext {
  clinicPhone: string;
  /** Patient DOB on record, YYYY-MM-DD. Never sent to the model; used here only. */
  dobIso: string | null;
  /** Referral reason + specialty text (never sent to the model). */
  sensitiveText: string;
  offeredSlots: OfferedSlot[];
  identityVerified: boolean;
}

const STOPWORDS = new Set(['about', 'after', 'before', 'referral', 'follow', 'patient', 'other', 'their', 'there',
  'which', 'with', 'from', 'check', 'visit', 'consult', 'routine', 'appointment', 'evaluation', 'clinic', 'doctor']);
const DAY_WORDS = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?\b|\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b|\b(today|tomorrow|tonight|manana|hoy)\b/;
const MONTH_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2} de [a-z]+\b|\b\d{1,2}\/\d{1,2}\b/;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.? ?m\.?|p\.? ?m\.?)(?=[^a-z]|$)/gi;

function digitsOf(s: string): string { return s.replace(/\D/g, ''); }

function dobVariants(isoDob: string): string[] {
  const [y, m, d] = isoDob.split('-');
  const mm = String(+m), dd = String(+d), yy = y.slice(2);
  return [
    `${m}/${d}/${y}`, `${mm}/${dd}/${y}`, `${m}/${d}/${yy}`, `${mm}/${dd}/${yy}`,
    `${m}-${d}-${y}`, `${mm}-${dd}-${y}`, isoDob, `${m}${d}${y}`, `${y}${m}${d}`,
  ];
}

function slotTimes(slots: OfferedSlot[]): Set<string> {
  const set = new Set<string>();
  for (const s of slots) {
    for (const label of [s.time, s.label_en, s.label_es]) {
      for (const m of label.matchAll(TIME_RE)) set.add(`${+m[1]}:${m[2] ?? '00'}${m[3].toLowerCase().startsWith('p') ? 'p' : 'a'}`);
    }
  }
  return set;
}

/** Returns the list of guard violations ([] = OK to send). */
export function validateOutgoing(text: string, ctx: OutgoingContext): string[] {
  const problems: string[] = [];
  if (!text.trim()) problems.push('empty');
  const seg = measureSms(text);
  if (seg.segments > MAX_SEGMENTS) problems.push(`too long (${seg.segments} segments)`);
  if (/\p{Extended_Pictographic}/u.test(text)) problems.push('emoji');
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|gov|edu|io|ly|co|us|info|health|app|me|link)\b)/i.test(text)) problems.push('link');

  // Phone numbers other than the clinic's, 911 or 988.
  const clinic = digitsOf(ctx.clinicPhone).replace(/^1(?=\d{10}$)/, '');
  for (const m of text.matchAll(/\+?\d[\d\s().-]{5,}\d/g)) {
    const d = digitsOf(m[0]).replace(/^1(?=\d{10}$)/, '');
    if (d.length >= 7 && d !== clinic) problems.push('phone number');
  }

  // DOB digits.
  if (ctx.dobIso) {
    const lower = text.toLowerCase();
    const allDigits = digitsOf(text);
    const record = normalizeDob(ctx.dobIso);
    const hit = dobVariants(ctx.dobIso).some(v => (/\D/.test(v) ? lower.includes(v) : allDigits.includes(v)))
      || (!!record && datesIn(text, new Date()).includes(record)); // "Feb 28, 1981", "28 de febrero de 1981"
    if (hit) problems.push('date of birth');
  }

  // Words from the referral reason / specialty.
  const norm = ` ${normalizeText(text)} `;
  for (const w of new Set(normalizeText(ctx.sensitiveText).split(' '))) {
    if (w.length >= 5 && !STOPWORDS.has(w) && norm.includes(` ${w} `)) { problems.push('referral detail'); break; }
  }

  // Dates/times: none before identity is verified; afterwards only offered slot times.
  const times = [...text.matchAll(TIME_RE)].map(m => `${+m[1]}:${m[2] ?? '00'}${m[3].toLowerCase().startsWith('p') ? 'p' : 'a'}`);
  if (!ctx.identityVerified) {
    if (times.length || DAY_WORDS.test(normalizeText(text)) || MONTH_DATE.test(normalizeText(text))) problems.push('date/time before identity verified');
  } else {
    const allowed = slotTimes(ctx.offeredSlots);
    if (times.some(t => !allowed.has(t))) problems.push('time not in offered slots');
  }
  return [...new Set(problems)];
}

// ── Precedence (SMS_AGENT_PROMPT §1.3) ──────────────────────────────────────

export type Decision =
  | { kind: 'red'; code: RedCode; template: 'emergency_reply' | 'crisis_reply' }
  | { kind: 'opt_out'; template: 'stop_confirmation' }
  | { kind: 'wrong_number'; template: 'wrong_number' }
  | { kind: 'amber'; code: string; pause: boolean; template: string | null; replyText: string | null; alsoCapture: string | null }
  | { kind: 'captured'; slotId: string; template: 'slot_captured' }
  | { kind: 'reply'; template: string | null; replyText: string | null }
  | { kind: 'agent_error'; reason: string };

/**
 * Applies the precedence rules to a validated model output.
 *  - A backstop match forces red even if the model said otherwise.
 *  - A captured slot is only accepted when identity is verified and the id is in offered_slots;
 *    anything else is an agent_error (send nothing).
 *  - An amber item WITHOUT pause (cost, transport) still lets a valid captured slot through
 *    (`alsoCapture`), since those reasons explicitly allow scheduling to continue.
 */
export function resolveDecision(
  out: SmsTurnOutput,
  opts: { backstop: { code: RedCode } | null; identityVerified: boolean; offeredSlotIds: string[] },
): Decision {
  if (opts.backstop || out.escalation.tier === 'red') {
    const code = (out.escalation.tier === 'red' ? out.escalation.reason_code : opts.backstop!.code) as RedCode;
    return { kind: 'red', code, template: redTemplateFor(code) };
  }
  if (out.opt_out) return { kind: 'opt_out', template: 'stop_confirmation' };
  if (out.wrong_number) return { kind: 'wrong_number', template: 'wrong_number' };

  let captureId: string | null = null;
  if (out.captured_slot) {
    if (!opts.identityVerified || !opts.offeredSlotIds.includes(out.captured_slot.slot_id)) {
      return { kind: 'agent_error', reason: 'captured slot not allowed (unverified or not offered)' };
    }
    captureId = out.captured_slot.slot_id;
  }

  if (out.escalation.tier === 'amber') {
    const pause = out.escalation.pause_automation;
    const alsoCapture = !pause ? captureId : null;
    const template = out.use_template ?? (pause && !alsoCapture ? 'human_handoff' : null);
    return {
      kind: 'amber', code: out.escalation.reason_code!, pause,
      template: alsoCapture ? 'slot_captured' : template,
      replyText: template ? null : out.reply_text,
      alsoCapture,
    };
  }
  if (captureId) return { kind: 'captured', slotId: captureId, template: 'slot_captured' };
  if (out.help_requested) return { kind: 'reply', template: 'help_reply', replyText: null };
  return { kind: 'reply', template: out.use_template, replyText: out.use_template ? null : out.reply_text };
}
