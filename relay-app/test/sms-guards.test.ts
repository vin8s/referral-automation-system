// Code-side safety guards (AGENT_SAFETY_RULES §0). Fake data only.
import { describe, expect, it } from 'vitest';
import {
  detectEmergency, detectKeyword, dobMatches, normalizeDob, resolveDecision, validateModelOutput, validateOutgoing,
} from '@/server/sms/guards';
import { measureSms } from '@/server/sms/segments';
import { renderTemplate } from '@/server/sms/templates';
import type { OfferedSlot, SmsTurnOutput } from '@/server/sms/types';

function out(p: Partial<SmsTurnOutput> = {}): SmsTurnOutput {
  return {
    reply_text: null, use_template: null, language: 'en', language_switch_request: null, intent: 'other',
    identity: { dob_candidate: null, says_not_patient: false, says_is_proxy: false },
    captured_slot: null, preferences: null, friction: [],
    escalation: { tier: 'none', reason_code: null, pause_automation: false, staff_summary: null },
    opt_out: false, help_requested: false, wrong_number: false, call_outcome: null, conversation_complete: false,
    ...p,
  };
}

const SLOTS: OfferedSlot[] = [
  { slot_id: 's_a', start: '2026-11-17T10:30:00-08:00', provider: 'Dr. Park', label_en: 'Tue, Nov 17 at 10:30 AM', label_es: 'martes 17 de nov., 10:30 a. m.', day: 'Tue Nov 17', time: '10:30 AM' },
  { slot_id: 's_b', start: '2026-11-18T14:00:00-08:00', provider: 'Dr. Lin', label_en: 'Wed, Nov 18 at 2:00 PM', label_es: 'miércoles 18 de nov., 2:00 p. m.', day: 'Wed Nov 18', time: '2:00 PM' },
];

describe('keyword detection (R6.2)', () => {
  it.each([
    ['STOP', 'opt_out'], ['stop', 'opt_out'], ['Stop.', 'opt_out'], ['  stop  ', 'opt_out'], ['UNSUBSCRIBE', 'opt_out'],
    ['cancel', 'opt_out'], ['QUIT!', 'opt_out'], ['Alto', 'opt_out'], ['BASTA', 'opt_out'], ['cancelar', 'opt_out'],
    ['HELP', 'help'], ['info', 'help'], ['Ayuda', 'help'], ['AYUDA!!', 'help'], ['START', 'opt_in'], ['unstop', 'opt_in'],
  ])('%s → %s', (body, action) => {
    expect(detectKeyword(body)?.action).toBe(action);
  });

  it('uses Spanish for Spanish keywords', () => {
    expect(detectKeyword('alto')?.lang).toBe('es');
    expect(detectKeyword('AYUDA')?.lang).toBe('es');
  });

  it.each(['stop texting me please', 'please stop', 'cancel my appointment', 'I need help', 'stopped', 'no quiero'])(
    'is exact-match only: %s', body => expect(detectKeyword(body)).toBeNull());
});

describe('emergency backstop (R1)', () => {
  it.each([
    ['my chest really hurts right now', 'emergency_medical'],
    ['i cant breathe', 'emergency_medical'],
    ["I can't breathe", 'emergency_medical'],
    ['sorry for typos my face feels numb on one side and my words r coming out weird lol', 'emergency_medical'],
    ['oiga desde la mañana siento el pecho apretado, ¿será normal? lo del jueves me sirve', 'emergency_medical'],
    ['mi esposo se desmayó y no despierta', 'emergency_medical'],
    ['the chest pain from last year came back this morning', 'emergency_medical'],
    ['took like 20 of my pills idk', 'overdose_poisoning'],
    ['me tomé muchas pastillas', 'overdose_poisoning'],
    ['no puedo ir, mi pareja me pega y no me deja salir', 'violence_danger'],
    ["honestly what's the point i want to kill myself", 'suicide_self_harm'],
    ['might just kms tbh', 'suicide_self_harm'],
    ['no se preocupen por la cita, para esa fecha ya no voy a estar aquí', 'suicide_self_harm'],
    ['me quiero morir', 'suicide_self_harm'],
  ])('%s → %s', (body, code) => {
    expect(detectEmergency(body)?.code).toBe(code);
  });

  it.each([
    "is this for the chest pain i had last year? it's been fine since",
    'thursday afternoon pls',
    '2',
    'how much will this cost',
    'número equivocado, no conozco a esa persona',
  ])('does not fire on: %s', body => expect(detectEmergency(body)).toBeNull());
});

describe('identity comparison (R4)', () => {
  it.each([
    ['03/04/1980'], ['3/4/1980'], ['3/4/80'], ['03-04-1980'], ['1980-03-04'], ['March 4 1980'], ['march 4th, 1980'],
    ['4 de marzo de 1980'], ['03041980'],
  ])('%s matches 1980-03-04', typed => expect(dobMatches(normalizeDob(typed), '1980-03-04')).toBe(true));

  it('rejects other dates and nulls', () => {
    expect(dobMatches('1990-01-01', '1980-03-04')).toBe(false);
    expect(dobMatches('1980-04-03', '1980-03-04')).toBe(false); // day/month swapped
    expect(dobMatches(null, '1980-03-04')).toBe(false);
    expect(dobMatches('1980-03-04', null)).toBe(false);
    expect(normalizeDob('02/30/1980')).toBeNull();
  });
});

describe('model output validation (SMS_AGENT_PROMPT §4)', () => {
  it('accepts a valid turn', () => {
    expect(validateModelOutput(out({ reply_text: 'Hi' })).ok).toBe(true);
  });
  it('rejects junk and missing fields', () => {
    expect(validateModelOutput(null).ok).toBe(false);
    expect(validateModelOutput({ reply_text: 'x' }).ok).toBe(false);
    expect(validateModelOutput(out({ reply_text: 'x'.repeat(460) })).ok).toBe(false);
    // A little over the 300-character target is fine (up to 3 segments / 459 characters).
    expect(validateModelOutput(out({ reply_text: 'x'.repeat(400) })).ok).toBe(true);
  });
  it('rejects tier/reason mismatches', () => {
    expect(validateModelOutput(out({ escalation: { tier: 'red', reason_code: 'complaint', pause_automation: true, staff_summary: null } })).ok).toBe(false);
    expect(validateModelOutput(out({ escalation: { tier: 'amber', reason_code: null, pause_automation: true, staff_summary: null } })).ok).toBe(false);
    expect(validateModelOutput(out({ escalation: { tier: 'none', reason_code: 'complaint', pause_automation: false, staff_summary: null } })).ok).toBe(false);
  });
  it('repairs a red turn to the right fixed template', () => {
    const v = validateModelOutput(out({
      reply_text: 'improvised', use_template: 'human_handoff',
      escalation: { tier: 'red', reason_code: 'suicide_self_harm', pause_automation: true, staff_summary: null },
    }));
    expect(v.ok && v.output.use_template).toBe('crisis_reply');
    expect(v.ok && v.output.reply_text).toBeNull();
  });
});

describe('precedence (red > opt_out > wrong_number > amber > captured_slot > reply_text)', () => {
  const opts = { backstop: null, identityVerified: true, offeredSlotIds: ['s_a', 's_b'] };
  const red = { tier: 'red' as const, reason_code: 'emergency_medical', pause_automation: true, staff_summary: null };
  const amber = (code: string, pause: boolean) => ({ tier: 'amber' as const, reason_code: code, pause_automation: pause, staff_summary: null });

  it('red beats everything, including a captured slot', () => {
    const d = resolveDecision(out({ escalation: red, opt_out: true, captured_slot: { slot_id: 's_a', patient_text: 'x' } }), opts);
    expect(d).toMatchObject({ kind: 'red', template: 'emergency_reply' });
  });
  it('the backstop forces red even when the model says none', () => {
    expect(resolveDecision(out(), { ...opts, backstop: { code: 'suicide_self_harm' } })).toMatchObject({ kind: 'red', template: 'crisis_reply' });
  });
  it('opt-out beats wrong number and amber', () => {
    expect(resolveDecision(out({ opt_out: true, wrong_number: true, escalation: amber('complaint', true) }), opts).kind).toBe('opt_out');
  });
  it('wrong number beats amber', () => {
    expect(resolveDecision(out({ wrong_number: true, escalation: amber('wrong_number', true) }), opts).kind).toBe('wrong_number');
  });
  it('amber with pause beats a captured slot and defaults to human_handoff', () => {
    const d = resolveDecision(out({ escalation: amber('clinical_question', true), captured_slot: { slot_id: 's_a', patient_text: '1' }, reply_text: 'hi' }), opts);
    expect(d).toMatchObject({ kind: 'amber', template: 'human_handoff', alsoCapture: null });
  });
  it('amber without pause still lets a valid slot through', () => {
    const d = resolveDecision(out({ escalation: amber('transport_assistance', false), captured_slot: { slot_id: 's_b', patient_text: 'wed' } }), opts);
    expect(d).toMatchObject({ kind: 'amber', alsoCapture: 's_b', template: 'slot_captured' });
  });
  it('captured slot needs identity + an offered slot id, else agent_error', () => {
    expect(resolveDecision(out({ captured_slot: { slot_id: 's_a', patient_text: '1' } }), opts)).toMatchObject({ kind: 'captured', slotId: 's_a' });
    expect(resolveDecision(out({ captured_slot: { slot_id: 's_zzz', patient_text: '1' } }), opts).kind).toBe('agent_error');
    expect(resolveDecision(out({ captured_slot: { slot_id: 's_a', patient_text: '1' } }), { ...opts, identityVerified: false }).kind).toBe('agent_error');
  });
  it('use_template overrides reply_text', () => {
    expect(resolveDecision(out({ use_template: 'help_reply', reply_text: 'ignored' }), opts)).toMatchObject({ kind: 'reply', template: 'help_reply', replyText: null });
    expect(resolveDecision(out({ reply_text: 'hello' }), opts)).toMatchObject({ kind: 'reply', template: null, replyText: 'hello' });
  });
});

describe('outbound guard', () => {
  const ctx = { clinicPhone: '(555) 555-0123', dobIso: '1980-03-04', sensitiveText: 'Arrhythmia evaluation Cardiology', offeredSlots: SLOTS, identityVerified: true };

  it('passes a normal reply', () => {
    expect(validateOutgoing('Which time works? Reply 1 or 2: 1) Tue, Nov 17 at 10:30 AM 2) Wed, Nov 18 at 2:00 PM. Or call (555) 555-0123.', ctx)).toEqual([]);
    expect(validateOutgoing('Please call 911 now or text 988.', ctx)).toEqual([]);
  });
  it.each([
    ['Book at https://example.com', 'link'],
    ['See www.clinic.org', 'link'],
    ['Call us at 415-555-0199', 'phone number'],
    ['Your DOB 03/04/1980 is on file', 'date of birth'],
    ['Confirming 3/4/80', 'date of birth'],
    ['This is for your arrhythmia', 'referral detail'],
    ['Your cardiology visit', 'referral detail'],
    ['How about 11:00 AM?', 'time not in offered slots'],
    ['Great 🙂', 'emoji'],
    ['x'.repeat(500), 'too long (4 segments)'],
  ])('rejects: %s', (text, problem) => {
    expect(validateOutgoing(text, ctx)).toContain(problem);
  });
  it('blocks any date/time before identity is verified', () => {
    expect(validateOutgoing('We have Tuesday at 10:30 AM', { ...ctx, identityVerified: false })).toContain('date/time before identity verified');
    expect(validateOutgoing('Please reply with your date of birth (MM/DD/YYYY).', { ...ctx, identityVerified: false })).toEqual([]);
  });
});

describe('templates + segments', () => {
  it('uses GSM-7 Spanish variants where the doc offers them', () => {
    const t = renderTemplate('slot_captured', 'es', { slot_label: 'martes 17 de nov., 10:30 a. m.', clinic_phone: '(555) 555-0123' });
    expect(t.encoding).toBe('GSM-7');
    expect(t.segments).toBeLessThanOrEqual(2);
  });
  it('first outreach uses the owner-approved wording and asks only for DOB', () => {
    const t = renderTemplate('first_outreach', 'en', { patient_first_name: 'Grace', clinic_name: 'Rhode Island Free Clinic' });
    expect(t.text).toBe('Hi Grace, this is the scheduling team at Rhode Island Free Clinic. Your provider asked us to help you make an appointment. To protect your privacy, please reply with your date of birth (MM/DD/YYYY). Reply STOP to opt out.');
    expect(t.text).toContain('date of birth');
    expect(t.segments).toBe(2);
  });
  it('drops the third slot line when only two slots are offered', () => {
    const t = renderTemplate('slot_offer', 'en', { patient_first_name: 'Grace', slot_1: 'A', slot_2: 'B' });
    expect(t.text).not.toContain('3)');
    expect(t.text).toContain('Reply 1 or 2');
  });
  it('counts UCS-2 when a non-GSM accent is present', () => {
    expect(measureSms('sábado').encoding).toBe('UCS-2');
    expect(measureSms('miércoles').encoding).toBe('GSM-7');
  });
});

describe('specialty phrase', () => {
  it('sanitizes staff input so it can never carry digits, links or punctuation', async () => {
    const { specialtyPhrase } = await import('@/server/sms/specialty');
    expect(specialtyPhrase('Primary care', 'en')).toBe(' for your primary care appointment');
    expect(specialtyPhrase('OB/GYN', 'en')).toBe(' for your OB/GYN appointment');
    const nasty = specialtyPhrase('call 401-555-0100 www.x.com', 'en');
    expect(nasty).not.toMatch(/[0-9.:/]/);
    expect(nasty.length).toBeLessThan(70);
    expect(specialtyPhrase('', 'en')).toBe('');
    expect(specialtyPhrase(null, 'es')).toBe('');
  });
});
