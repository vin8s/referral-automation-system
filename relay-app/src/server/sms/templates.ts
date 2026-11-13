// Fixed SMS templates.
//
// SOURCE: templates.json is a verbatim copy of docs/sms-templates.json (DRAFT,
// clinician approval required). If the doc changes, copy it again:
//     cp ../docs/sms-templates.json src/server/sms/templates.json
//
// Spanish: where the doc offers an `es_gsm_variant` (reworded to stay in GSM-7,
// fewer segments), we use it, as AGENT_SAFETY_RULES §12 #11 recommends.

import 'server-only';
import raw from './templates.json';
import { measureSms, type SegmentInfo } from './segments';

export type Lang = 'en' | 'es';

export type TemplateId =
  | 'first_outreach' | 'follow_up_1' | 'follow_up_2' | 'final_attempt' | 'slot_offer' | 'slot_captured'
  | 'booked_confirmation' | 'reminder_day_before' | 'cancellation_reoffer' | 'stop_confirmation'
  | 'help_reply' | 'wrong_number' | 'identity_not_verified' | 'emergency_reply' | 'crisis_reply'
  | 'human_handoff'
  // Code-local lines that are not in docs/sms-templates.json (see CODE_TEMPLATES below).
  | 'identity_retry' | 'red_followup_emergency' | 'red_followup_crisis' | 'language_barrier';

interface TemplateDoc {
  id: string;
  en: { text: string };
  es: { text: string };
  es_gsm_variant?: { text: string };
}

const DOC = (raw as unknown as { templates: TemplateDoc[] }).templates;

/**
 * Short fixed lines the safety rules describe but the template file doesn't
 * contain. DRAFT wording, same clinician-approval requirement as the JSON file.
 *   identity_retry          R4.3: first DOB mismatch, ask again without hints.
 *   red_followup_*          R1.2.5: one short supportive line when a patient keeps texting after red.
 *   language_barrier        R8.3: short bilingual handoff.
 */
const CODE_TEMPLATES: Record<string, Record<Lang, string>> = {
  identity_retry: {
    en: 'Sorry, we could not match that. Please check and reply with your date of birth again (MM/DD/YYYY).',
    es: 'Lo sentimos, no pudimos confirmar ese dato. Por favor revise y responda otra vez con su fecha de nacimiento (MM/DD/AAAA).',
  },
  red_followup_emergency: {
    en: 'Please call 911 now. Our staff have been alerted.',
    es: 'Por favor llame al 911 ahora. Ya avisamos al personal.',
  },
  red_followup_crisis: {
    en: 'Please call or text 988 now, or call 911 if you are in danger. Our staff have been alerted.',
    es: 'Por favor llame al 988 y marque 2, o llame al 911 si corre peligro. Ya avisamos al personal.',
  },
  language_barrier: {
    en: 'A staff member will contact you. / Alguien del personal se comunicará con usted.',
    es: 'A staff member will contact you. / Alguien del personal se comunicará con usted.',
  },
};

/** Templates that go out immediately at any hour (R7.2). */
export const IMMEDIATE_TEMPLATES: ReadonlySet<string> = new Set([
  'emergency_reply', 'crisis_reply', 'stop_confirmation', 'help_reply', 'wrong_number',
  'red_followup_emergency', 'red_followup_crisis',
]);

/** Unsolicited outreach templates (count toward the lifetime cap). */
export const OUTREACH_STEPS = ['first_outreach', 'follow_up_1', 'follow_up_2', 'final_attempt'] as const;

export function templateText(id: TemplateId, lang: Lang): string {
  const code = CODE_TEMPLATES[id];
  if (code) return code[lang];
  const t = DOC.find(d => d.id === id);
  if (!t) throw new Error(`Unknown SMS template ${id}`);
  if (lang === 'es') return (t.es_gsm_variant ?? t.es).text;
  return t.en.text;
}

export type TemplateVars = Partial<Record<
  'patient_first_name' | 'clinic_name' | 'clinic_phone' | 'slot_label' | 'slot_1' | 'slot_2' | 'slot_3'
  | 'appointment_date_time' | 'location_short', string>>;

/** Fills {{vars}}. Missing slot lines (e.g. only 2 slots offered) are dropped. */
export function renderTemplate(id: TemplateId, lang: Lang, vars: TemplateVars): { text: string } & SegmentInfo {
  let text = templateText(id, lang);
  // Drop "3) {{slot_3}}" lines when that slot is absent.
  text = text.split('\n').filter(line => {
    const m = line.match(/\{\{(slot_[123])\}\}/);
    return !m || !!vars[m[1] as keyof TemplateVars];
  }).join('\n');
  if (!vars.slot_3) text = text.replace('Reply 1, 2 or 3', 'Reply 1 or 2').replace('Responda 1, 2 o 3', 'Responda 1 o 2');
  text = text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k as keyof TemplateVars] ?? '');
  return { text, ...measureSms(text) };
}
