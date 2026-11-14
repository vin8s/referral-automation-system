// The {{specialty_phrase}} of the slot_offer template.
//
// Owner decision 2026-11-14: the specialty is named to the patient only AFTER the
// date of birth is verified, in the time-offer text, and only there. It is filled
// in by code (never by the AI model, which never sees it). The referral `reason`
// is never used here or anywhere in a text.

import 'server-only';
import { sanitizeSpecialty } from '@/lib/specialties';
import type { Lang } from './templates';

/**
 * English → Spanish wording for the suggestion list ("su cita de …" / "su cita
 * con …"). Where a GSM-7 wording is equally natural it is preferred (medicina
 * general, salud mental, fisioterapia), but a correct accented word beats a
 * misspelling. Unknown specialties fall back to the English text.
 */
const ES_NAMES: Record<string, string> = {
  'primary care': 'de medicina general',
  'psychiatry': 'de salud mental',
  'ophthalmology': 'de oftalmología',
  'dermatology': 'de dermatología',
  'cardiology': 'de cardiología',
  'endocrinology': 'de endocrinología',
  'gastroenterology': 'de gastroenterología',
  'neurology': 'de neurología',
  'orthopedics': 'de ortopedia',
  'ob/gyn': 'de ginecología y obstetricia',
  'dental': 'con el dentista',
  'physical therapy': 'de fisioterapia',
};

/** Acronym-style names keep their casing ("OB/GYN", "ENT"). */
const KEEP_CASE = /^[A-Z/&-]{2,}(\s[A-Z/&-]{2,})*$/;

/** "Primary care" → "primary care"; "OB/GYN" stays "OB/GYN". */
export function specialtyForText(raw: string): string {
  const clean = sanitizeSpecialty(raw);
  if (!clean) return '';
  return KEEP_CASE.test(clean) ? clean : clean.toLowerCase();
}

/**
 * The phrase inserted into slot_offer: " for your primary care appointment" /
 * " para su cita de medicina general". Empty when no specialty is set.
 */
export function specialtyPhrase(raw: string | null | undefined, lang: Lang): string {
  const name = specialtyForText(raw ?? '');
  if (!name) return '';
  if (lang === 'es') return ` para su cita ${ES_NAMES[name.toLowerCase()] ?? `de ${name}`}`;
  return ` for your ${name} appointment`;
}
