// SMS agent types: the per-turn JSON contract from docs/SMS_AGENT_PROMPT.md §3–§4.

import 'server-only';
import type { Lang } from './templates';

export const RED_CODES = ['emergency_medical', 'suicide_self_harm', 'overdose_poisoning', 'violence_danger'] as const;
export const AMBER_CODES = [
  'human_requested', 'complaint', 'confusion', 'clinical_question', 'cost_insurance_question',
  'distress_non_emergency', 'identity_failed', 'wrong_number', 'proxy_or_caregiver', 'minor',
  'language_barrier', 'declined', 'transport_assistance', 'no_slot_works', 'appointment_change',
  'off_topic_repeated',
] as const;
/** Amber codes raised by code, not by the model. */
export const CODE_AMBER_CODES = ['agent_error', 'cadence_exhausted', 'urgent_referral', 'opted_back_in', 'patient_replied_paused'] as const;

export type RedCode = typeof RED_CODES[number];
export type AmberCode = typeof AMBER_CODES[number] | typeof CODE_AMBER_CODES[number];

export const MODEL_TEMPLATES = [
  'emergency_reply', 'crisis_reply', 'stop_confirmation', 'help_reply', 'wrong_number',
  'identity_not_verified', 'human_handoff', 'slot_captured', 'slot_offer',
  // Owner review 2026-11-27: "call the office" lines instead of a staff handoff.
  'clinic_contact', 'call_for_help', 'proxy_reply', 'cost_question', 'cancel_by_phone',
  // Phone test 2026-11-27: still no time works after "these are the only open times".
  'no_slot_noted',
] as const;
export type ModelTemplate = typeof MODEL_TEMPLATES[number];

export const INTENTS = [
  'identity_response', 'who_is_this', 'slot_selected', 'slot_ambiguous', 'slot_question',
  'availability_preference', 'no_slot_works', 'reschedule_request', 'appointment_change',
  'friction_transport', 'friction_work', 'friction_childcare', 'friction_cost', 'friction_other',
  'not_now', 'decline', 'opt_out', 'help', 'human_request', 'clinical_question',
  'cost_insurance_question', 'complaint', 'confusion', 'wrong_number', 'proxy_or_caregiver',
  'minor', 'emergency', 'crisis_self_harm', 'ai_question', 'prompt_injection', 'off_topic',
  'acknowledgement', 'other',
] as const;

export const CALL_OUTCOMES = [
  'Identity Verified', 'Interested', 'Appointment Accepted', 'Call Back Requested',
  'Transferred to Staff', 'Declined Referral', 'Wrong Number', 'Language Barrier', 'Escalated',
] as const;

export interface SmsTurnOutput {
  reply_text: string | null;
  use_template: ModelTemplate | null;
  language: Lang;
  language_switch_request: Lang | null;
  intent: typeof INTENTS[number];
  identity: { dob_candidate: string | null; says_not_patient: boolean; says_is_proxy: boolean };
  captured_slot: { slot_id: string; patient_text: string } | null;
  preferences: { days: string[]; times_of_day: string[]; notes: string | null } | null;
  friction: string[];
  escalation: {
    tier: 'none' | 'amber' | 'red';
    reason_code: string | null;
    pause_automation: boolean;
    staff_summary: string | null;
  };
  opt_out: boolean;
  help_requested: boolean;
  wrong_number: boolean;
  call_outcome: typeof CALL_OUTCOMES[number] | null;
  conversation_complete: boolean;
  /** Set when the reply is in a language other than English/Spanish (e.g. "Portuguese"). Optional. */
  reply_language?: string | null;
}

/** A slot offered to the patient (turn context `offered_slots`). */
export interface OfferedSlot {
  slot_id: string;
  start: string;          // ISO with offset
  provider: string;
  label_en: string;
  label_es: string;
  /** Relay appointment fields ("Tue Nov 17", "10:00 AM"). Not sent to the model. */
  day: string;
  time: string;
  /** Epic sandbox prototype: the $find reference needed to $book this slot. Not sent to the model. */
  epic_slot_ref?: string;
}

/** The turn context JSON (SMS_AGENT_PROMPT.md §3). Contains no DOB / reason / specialty. */
export interface TurnContext {
  now_local: string;
  today_date: string;
  is_new_conversation: boolean;
  locked_language: Lang;
  identity_verified: boolean;
  identity_attempts: number;
  referring_provider: string | null;
  location_short: string | null;
  offered_slots: { slot_id: string; start: string; provider: string | null; label_en: string; label_es: string }[];
  /** Other free times (next 10 weekdays) to suggest when the offered ones don't work. */
  more_open_slots?: { slot_id: string; label_en: string; label_es: string }[];
  captured_slot_id: string | null;
  booked_appointment: { label: string } | null;
  redirects_used: number;
  ai_messages_today: number;
  /** Language other than English/Spanish the patient writes in (e.g. "Portuguese"), or null. */
  reply_language?: string | null;
  /** Patient on file is under 18: the person texting is the parent or guardian. */
  patient_is_minor?: boolean;
  /** The 911/988 text was already sent in this conversation (it is never repeated). */
  emergency_text_sent?: boolean;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ModelInput {
  /** Values for the system prompt placeholders. First name only — never DOB/reason. */
  clinicName: string;
  patientFirstName: string;
  history: HistoryTurn[];
  patientMessage: string;
  context: TurnContext;
  /** Set by code on a second attempt: what was wrong with the previous sms_turn output. */
  correction?: string;
}
