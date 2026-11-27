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
  | 'identity_retry' | 'identity_ask' | 'red_followup_emergency' | 'red_followup_crisis' | 'language_barrier'
  | 'clinic_contact' | 'call_for_help' | 'proxy_reply' | 'cost_question' | 'cancel_by_phone' | 'first_outreach_guardian' | 'slot_clarify'
  | 'only_times_available' | 'no_slot_noted';

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
 *   identity_ask            Safe fallback before identity is verified when the AI reply is blocked by the outbound guard.
 *   red_followup_*          R1.2.5: one short supportive line when a patient keeps texting after red.
 *   language_barrier        R8.3: short bilingual handoff.
 * Owner review 2026-11-27 (graded test run), instead of a silent staff handoff:
 *   clinic_contact          "How do I contact the clinic?"
 *   call_for_help           Off-topic after two redirects, phone-number change, diagnosis/specialty questions.
 *   proxy_reply             Someone texting about a person who is not the patient on file (shares nothing).
 *   cost_question           Cost, insurance, payment.
 *   cancel_by_phone         Cancel / change an appointment (staff also get an amber item).
 *   first_outreach_guardian First text when the patient on file is under 18: goes to the parent's phone.
 *   slot_clarify            "the morning one" when two offered times fit: ask which (no guessing).
 * Phone test 2026-11-27 (owner): "none of these work" when there are no other open times:
 *   only_times_available    First time: say these are the only open times and keep helping. No staff alert.
 *   no_slot_noted           Still none work after that: note their days/times; staff get amber no_slot_works.
 */
const CODE_TEMPLATES: Record<string, Record<Lang, string>> = {
  identity_ask: {
    en: 'To protect your privacy, please reply with your date of birth (MM/DD/YYYY). Reply STOP to opt out.',
    es: 'Para proteger su privacidad, responda con su fecha de nacimiento (MM/DD/AAAA). Responda ALTO para no recibir mensajes.',
  },
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
  clinic_contact: {
    en: 'You can contact the clinic by calling {{clinic_phone}} during regular office hours.',
    es: 'Puede comunicarse con nosotros llamando al {{clinic_phone}} en horario de oficina.',
  },
  call_for_help: {
    en: 'For additional assistance, please call {{clinic_phone}} during office hours.',
    es: 'Si necesita ayuda, llame al {{clinic_phone}} en horario de oficina.',
  },
  proxy_reply: {
    en: 'For more information, please call our office at {{clinic_phone}}.',
    es: 'Si tiene preguntas, llame a nuestra oficina al {{clinic_phone}}.',
  },
  cost_question: {
    en: 'For all financial questions, please contact our office at {{clinic_phone}} during office hours.',
    es: 'Para preguntas sobre costos o pagos, llame a nuestra oficina al {{clinic_phone}} en horario de oficina.',
  },
  cancel_by_phone: {
    en: "I can't cancel or change appointments by text. For additional assistance, please call {{clinic_phone}} during office hours.",
    es: 'No puedo cancelar ni cambiar citas por mensaje de texto. Si necesita ayuda, llame al {{clinic_phone}} en horario de oficina.',
  },
  slot_clarify: {
    en: 'Which one works best: {{slot_choices}}?',
    es: '¿Qué horario le queda mejor: {{slot_choices}}?',
  },
  only_times_available: {
    en: "Sorry, those are the only times we have open right now. Could one of them work? If not, tell us which days and times are best for you, and we'll keep looking.",
    es: 'Lo sentimos, por ahora solo tenemos esos horarios. ¿Le sirve alguno? Si no, cuéntenos qué horario le queda mejor y seguiremos buscando.',
  },
  no_slot_noted: {
    en: 'Thanks for letting us know. We noted what works for you, and our team will look for another time and text you.',
    es: 'Gracias por avisarnos. Anotamos el horario que le queda mejor. Nuestro equipo va a buscar otro horario y le va a mandar un mensaje.',
  },
  first_outreach_guardian: {
    en: "Hi, this is the scheduling team at {{clinic_name}}. {{patient_first_name}}'s provider asked us to help schedule an appointment for them. To protect their privacy, please reply with {{patient_first_name}}'s date of birth (MM/DD/YYYY). Reply STOP to opt out.",
    es: 'Hola, le escribe el equipo de citas de {{clinic_name}}. Queremos ayudarle a hacer una cita para {{patient_first_name}}. Para proteger su privacidad, responda con la fecha de nacimiento de {{patient_first_name}} (MM/DD/AAAA). Responda ALTO para no recibir mensajes.',
  },
  language_barrier: {
    en: 'A staff member will contact you. / Alguien del personal se comunicará con usted.',
    es: 'A staff member will contact you. / Alguien del personal se comunicará con usted.',
  },
};

/** Street address in booked_confirmation when CLINIC_ADDRESS is not set (Rhode Island Free Clinic). */
export const DEFAULT_CLINIC_ADDRESS = '655 Broad Street, 3rd Floor, Providence, RI 02907';

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
  | 'appointment_date_time' | 'location_short' | 'slot_choices' | 'clinic_address'
  /**
   * slot_offer only: " for your primary care appointment" / " para su cita de …", or "".
   * Filled by code (src/server/sms/specialty.ts) after identity is verified; never by the model.
   */
  | 'specialty_phrase', string>>;

/** Fills {{vars}}. Missing slot lines (e.g. only 2 slots offered) are dropped. */
export function renderTemplate(id: TemplateId, lang: Lang, vars: TemplateVars): { text: string } & SegmentInfo {
  let text = templateText(id, lang);
  // Drop "3) {{slot_3}}" lines when that slot is absent.
  text = text.split('\n').filter(line => {
    const m = line.match(/\{\{(slot_[123])\}\}/);
    return !m || !!vars[m[1] as keyof TemplateVars];
  }).join('\n');
  if (!vars.slot_3) text = text.replace('Reply 1, 2 or 3', 'Reply 1 or 2').replace('Responda 1, 2 o 3', 'Responda 1 o 2');
  const fill = (k: string) => {
    const v = vars[k as keyof TemplateVars] ?? '';
    // Inserted Spanish specialty names: drop the accents that are not in GSM-7 (á í ó ú) so one word
    // can't turn the whole text into UCS-2 (sim: "cardiología" made slot_offer 4 segments).
    return lang === 'es' && k === 'specialty_phrase' ? v.replace(/[áíóú]/g, c => ({ á: 'a', í: 'i', ó: 'o', ú: 'u' })[c]!) : v;
  };
  text = text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => fill(k));
  // "10:30 a. m." + "." in the template → "a. m.."
  text = text.replace(/(a|p)\. m\.\./g, '$1. m.');
  return { text, ...measureSms(text) };
}
