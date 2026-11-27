// Safety net for editing the messaging assistant's prompt (src/server/sms/systemPrompt.ts).
// The wording is free to change; these names are read by code and must match the schema.
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, SMS_TURN_SCHEMA, SYSTEM_PROMPT_TEMPLATE, TURN_CONTEXT_NOTE } from '@/server/sms/prompt';

const props = SMS_TURN_SCHEMA.properties;
const templateIds = new Set(props.use_template.enum.filter(Boolean) as string[]);
const reasonCodes = new Set(props.escalation.properties.reason_code.enum.filter(Boolean) as string[]);
const intents = new Set(props.intent.enum as readonly string[]);

const all = (re: RegExp) => [...SYSTEM_PROMPT_TEMPLATE.matchAll(re)].map(m => m[1]);

describe('system prompt ↔ code contract', () => {
  it('only uses the two placeholders the code fills in', () => {
    const used = new Set(all(/\{\{\s*([^}]+?)\s*\}\}/g));
    for (const name of used) expect(['clinic_name', 'patient_first_name'], `unknown placeholder {{${name}}}`).toContain(name);
    expect(buildSystemPrompt({ clinicName: 'Test Clinic', patientFirstName: 'Sam' })).not.toMatch(/\{\{|\}\}/);
  });

  it('every template it names exists', () => {
    for (const id of all(/use_template\s+"([a-z_]+)"/g)) expect(templateIds, `unknown template "${id}"`).toContain(id);
  });

  it('every escalation reason it names exists', () => {
    const named = [
      ...all(/\b(?:amber|red)\s+([a-z]+_[a-z_]+)\b/g),          // "set amber identity_failed"
      ...all(/^- ([a-z]+_[a-z_]+):/gm).filter(c => !['opt_out', 'reply_text', 'staff_summary', 'call_outcome', 'reply_language'].includes(c)),
    ];
    expect(named.length).toBeGreaterThan(0);
    for (const code of named) expect(reasonCodes, `unknown reason code "${code}"`).toContain(code);
  });

  it('every intent label it names exists', () => {
    for (const label of all(/intent\s+"([a-z_]+)"/g)) expect(intents, `unknown intent "${label}"`).toContain(label);
  });

  it('still tells the model to answer through the sms_turn tool', () => {
    expect(TURN_CONTEXT_NOTE).toContain('sms_turn');
    expect(TURN_CONTEXT_NOTE).toContain('turn_context');
  });
});
