// Output schema for the SMS agent, and the function that fills in the system prompt.
//
// The prompt text itself lives in ./systemPrompt.ts (edit it there).
// SMS_TURN_SCHEMA is the code copy of docs/SMS_AGENT_PROMPT.md §4 (the sms_turn JSON schema,
// minus $schema/title). The model also reads the field descriptions below.

import 'server-only';

import { SYSTEM_PROMPT_TEMPLATE } from './systemPrompt';

export { SYSTEM_PROMPT_TEMPLATE, TURN_CONTEXT_NOTE } from './systemPrompt';

/** Fills {{clinic_name}} / {{patient_first_name}}. No other patient data goes in the prompt. */
export function buildSystemPrompt(vars: { clinicName: string; patientFirstName: string }): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replaceAll('{{clinic_name}}', vars.clinicName)
    .replaceAll('{{patient_first_name}}', vars.patientFirstName);
}

export const SMS_TURN_SCHEMA = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "reply_text",
    "use_template",
    "language",
    "language_switch_request",
    "intent",
    "identity",
    "captured_slot",
    "preferences",
    "friction",
    "escalation",
    "opt_out",
    "help_requested",
    "wrong_number",
    "call_outcome",
    "conversation_complete"
  ],
  "properties": {
    "reply_text": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 459,
      "description": "Exact SMS to send. Null when use_template is set or no reply is needed."
    },
    "use_template": {
      "type": [
        "string",
        "null"
      ],
      "enum": [
        "emergency_reply",
        "crisis_reply",
        "stop_confirmation",
        "help_reply",
        "wrong_number",
        "identity_not_verified",
        "human_handoff",
        "slot_captured",
        "slot_offer",
        "clinic_contact",
        "call_for_help",
        "proxy_reply",
        "cost_question",
        "cancel_by_phone",
        "no_slot_noted",
        null
      ],
      "description": "Fixed template id from sms-templates.json. Overrides reply_text."
    },
    "language": {
      "type": "string",
      "enum": [
        "en",
        "es"
      ]
    },
    "language_switch_request": {
      "type": [
        "string",
        "null"
      ],
      "enum": [
        "en",
        "es",
        null
      ]
    },
    "intent": {
      "type": "string",
      "enum": [
        "identity_response",
        "who_is_this",
        "slot_selected",
        "slot_ambiguous",
        "slot_question",
        "availability_preference",
        "no_slot_works",
        "reschedule_request",
        "appointment_change",
        "friction_transport",
        "friction_work",
        "friction_childcare",
        "friction_cost",
        "friction_other",
        "not_now",
        "decline",
        "opt_out",
        "help",
        "human_request",
        "clinical_question",
        "cost_insurance_question",
        "complaint",
        "confusion",
        "wrong_number",
        "proxy_or_caregiver",
        "minor",
        "emergency",
        "crisis_self_harm",
        "ai_question",
        "prompt_injection",
        "off_topic",
        "acknowledgement",
        "other"
      ]
    },
    "identity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "dob_candidate",
        "says_not_patient",
        "says_is_proxy"
      ],
      "properties": {
        "dob_candidate": {
          "type": [
            "string",
            "null"
          ],
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "What the patient typed, normalized. Code verifies it."
        },
        "says_not_patient": {
          "type": "boolean"
        },
        "says_is_proxy": {
          "type": "boolean"
        }
      }
    },
    "captured_slot": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "slot_id",
        "patient_text"
      ],
      "properties": {
        "slot_id": {
          "type": "string",
          "description": "Must be one of offered_slots[].slot_id or more_open_slots[].slot_id"
        },
        "patient_text": {
          "type": "string",
          "maxLength": 200,
          "description": "Patient's words that picked it"
        }
      }
    },
    "preferences": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "days",
        "times_of_day",
        "notes"
      ],
      "properties": {
        "days": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "mon",
              "tue",
              "wed",
              "thu",
              "fri",
              "sat",
              "sun"
            ]
          }
        },
        "times_of_day": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "early_morning",
              "morning",
              "midday",
              "afternoon",
              "evening"
            ]
          }
        },
        "notes": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 200,
          "description": "Non-clinical only, e.g. 'works until 3pm, needs bus time'"
        }
      }
    },
    "friction": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "transport",
          "work",
          "childcare",
          "cost",
          "language",
          "other"
        ]
      }
    },
    "escalation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "tier",
        "reason_code",
        "pause_automation",
        "staff_summary"
      ],
      "properties": {
        "tier": {
          "type": "string",
          "enum": [
            "none",
            "amber",
            "red"
          ]
        },
        "reason_code": {
          "type": [
            "string",
            "null"
          ],
          "enum": [
            "emergency_medical",
            "suicide_self_harm",
            "overdose_poisoning",
            "violence_danger",
            "human_requested",
            "complaint",
            "confusion",
            "clinical_question",
            "cost_insurance_question",
            "distress_non_emergency",
            "identity_failed",
            "wrong_number",
            "proxy_or_caregiver",
            "minor",
            "language_barrier",
            "declined",
            "transport_assistance",
            "no_slot_works",
            "appointment_change",
            "off_topic_repeated",
            null
          ]
        },
        "pause_automation": {
          "type": "boolean"
        },
        "staff_summary": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 400
        }
      }
    },
    "opt_out": {
      "type": "boolean"
    },
    "help_requested": {
      "type": "boolean"
    },
    "wrong_number": {
      "type": "boolean"
    },
    "call_outcome": {
      "type": [
        "string",
        "null"
      ],
      "enum": [
        "Identity Verified",
        "Interested",
        "Appointment Accepted",
        "Call Back Requested",
        "Transferred to Staff",
        "Declined Referral",
        "Wrong Number",
        "Language Barrier",
        "Escalated",
        null
      ],
      "description": "Matches OutreachOutcome in relay-app/src/lib/types.ts, recorded on this text-outreach attempt."
    },
    "conversation_complete": {
      "type": "boolean"
    },
    "reply_language": {
      "type": [
        "string",
        "null"
      ],
      "maxLength": 30,
      "description": "English name of the language you replied in when it is not English or Spanish (e.g. Portuguese); otherwise null."
    }
  }
} as const;
