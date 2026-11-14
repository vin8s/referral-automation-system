// Code-side safety guards for the SMS agent (AGENT_SAFETY_RULES §0). Pure functions.
//
//   detectKeyword      R6.2  exact STOP / HELP / START keywords (EN + ES)
//   detectEmergency    R1    emergency/crisis phrase backstop (runs even when opted out)
//   validateModelOutput      schema + code-side checks from SMS_AGENT_PROMPT §4
//   validateOutgoing         outbound guard on AI-written text
//   resolveDecision          precedence red > opt_out > wrong_number > amber > captured_slot > reply_text
//   normalizeDob / dobMatches  R4 identity check (code compares; the model never sees the DOB)

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

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, enero: 1, feb: 2, february: 2, febrero: 2, mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abril: 4, may: 5, mayo: 5, jun: 6, june: 6, junio: 6, jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, agosto: 8, sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10, nov: 11, november: 11, noviembre: 11, dec: 12, december: 12, diciembre: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parses a typed date of birth ("3/4/80", "03-04-1980", "March 4 1980", "4 de marzo de 1980", "1980-03-04"). US month-first order. */
export function normalizeDob(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = normalizeText(input);
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  m = t.match(/\b(\d{2})(\d{2})(\d{4})\b/);
  if (m) return iso(+m[3], +m[1], +m[2]);
  // "march 4 1980", "march 4th, 1980"
  m = t.match(/\b([a-z]+)\s+(\d{1,2})(st|nd|rd|th)?\s+(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[1]]) return iso(+m[4], MONTHS[m[1]], +m[2]);
  // "4 de marzo de 1980", "4 march 1980"
  m = t.match(/\b(\d{1,2})\s+(de\s+)?([a-z]+)\s+(de(l)?\s+)?(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[3]]) return iso(+m[6], MONTHS[m[3]], +m[1]);
  return null;
}

/** Code-side identity comparison (R4.2). Both values are normalized; null never matches. */
export function dobMatches(candidate: string | null | undefined, recordIso: string | null | undefined): boolean {
  const a = normalizeDob(candidate ?? null);
  const b = normalizeDob(recordIso ?? null);
  return !!a && !!b && a === b;
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
  if (!oneOf(INTENTS, o.intent)) e.push('intent');

  const id = o.identity as Record<string, unknown> | null;
  if (!id || typeof id !== 'object') e.push('identity');
  else {
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
    const hit = dobVariants(ctx.dobIso).some(v => (/\D/.test(v) ? lower.includes(v) : allDigits.includes(v)));
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
