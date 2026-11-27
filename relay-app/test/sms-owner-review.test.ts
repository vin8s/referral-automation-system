// Owner review 2026-11-27 (graded 80-case run): code-side rules added for the cases the AI got wrong.
import { describe, expect, it } from 'vitest';
import { ambiguousPick, inferEscalation, mentionsRelativeBirthday } from '@/server/sms/guards';
import { DEFAULT_CLINIC_ADDRESS, renderTemplate } from '@/server/sms/templates';
import type { OfferedSlot } from '@/server/sms/types';
import { turn } from './sms-harness';

const slot = (id: string, day: string, time: string): OfferedSlot => ({
  slot_id: id, start: '2026-12-01T09:00:00-05:00', provider: 'Dr. Park', label_en: `${day} at ${time}`, label_es: `${day} ${time}`, day, time,
} as OfferedSlot);
const offered = [slot('a', 'Tue, Dec 1', '9:00 AM'), slot('b', 'Wed, Dec 2', '10:30 AM'), slot('c', 'Thu, Dec 3', '2:00 PM')];

describe('ambiguous picks (T-025)', () => {
  it('"the morning one" with two morning times → both, so code asks which', () => {
    expect(ambiguousPick('the morning one', offered).map(s => s.slot_id)).toEqual(['a', 'b']);
    expect(ambiguousPick('la de la mañana', offered).map(s => s.slot_id)).toEqual(['a', 'b']);
  });
  it('specific picks are never ambiguous', () => {
    for (const t of ['1', 'the first one', 'tuesday morning', 'the 9:00 one', 'the afternoon one']) expect(ambiguousPick(t, offered)).toEqual([]);
  });
});

describe('a relative\'s birthday is not the patient\'s (T-018, T-057)', () => {
  it('detects it in English and Spanish', () => {
    expect(mentionsRelativeBirthday('my son was born 3/4/2010')).toBe(true);
    expect(mentionsRelativeBirthday("this is for my son, he's 12. his birthday is 5/5/2014")).toBe(true);
    expect(mentionsRelativeBirthday('mi hijo nació el 3/4/2010')).toBe(true);
    expect(mentionsRelativeBirthday('my birthday is 02/28/1981')).toBe(false);
    expect(mentionsRelativeBirthday('my daughter usually helps me, my dob is 02/28/1981')).toBe(true); // safe side: proxy line, no failed attempt
  });
});

describe('intent → escalation when the model left tier "none"', () => {
  const opts = { body: 'x', identityVerified: true, patientIsMinor: false };
  it('cancel → amber appointment_change + cancel_by_phone (T-034, T-070)', () => {
    const o = inferEscalation(turn({ intent: 'appointment_change', use_template: 'cancel_by_phone' }), opts);
    expect(o.escalation).toMatchObject({ tier: 'amber', reason_code: 'appointment_change' });
    expect(o.use_template).toBe('cancel_by_phone');
  });
  it('complaint → amber complaint + human_handoff (T-053)', () => {
    const o = inferEscalation(turn({ intent: 'complaint', reply_text: 'sorry' }), { ...opts, identityVerified: false });
    expect(o.escalation.reason_code).toBe('complaint');
    expect(o.use_template).toBe('human_handoff');
  });
  it('proxy → amber proxy + proxy_reply, and no birthdate attempt', () => {
    const o = inferEscalation(turn({ intent: 'other', identity: { dob_candidate: '2010-03-04', says_not_patient: false, says_is_proxy: false } }),
      { body: 'my son was born 3/4/2010', identityVerified: false, patientIsMinor: false });
    expect(o.use_template).toBe('proxy_reply');
    expect(o.identity.dob_candidate).toBeNull();
  });
  it('a parent of a minor patient is NOT a proxy', () => {
    const o = inferEscalation(turn({ intent: 'proxy_or_caregiver' }), { body: 'this is for my son', identityVerified: false, patientIsMinor: true });
    expect(o.escalation.tier).toBe('none');
  });
  it('"what kind of doctor / my diagnosis" → call_for_help (T-086)', () => {
    const o = inferEscalation(turn({ intent: 'clinical_question', reply_text: 'I cannot share...' }), { ...opts, body: "what kind of doctor is this? what's my diagnosis?" });
    expect(o.use_template).toBe('call_for_help');
    expect(o.reply_text).toBeNull();
  });
});

describe('owner wording (fixed texts)', () => {
  const v = { clinic_phone: '(401) 555-0100', slot_label: 'Tue, Dec 1 at 9:00 AM', slot_choices: 'A or B' };
  it('uses the owner\'s texts', () => {
    expect(renderTemplate('emergency_reply', 'en', v).text).toBe('For all emergencies, please call 911 or go to the nearest emergency room.');
    expect(renderTemplate('crisis_reply', 'en', v).text).toMatch(/^Help is available right now and you matter\. Call or text 988/);
    expect(renderTemplate('slot_captured', 'en', v).text).toMatch(/Note: this is not booked yet/);
    expect(renderTemplate('slot_clarify', 'en', v).text).toBe('Which one works best: A or B?');
  });
  it('every new fixed text fits in 2 SMS parts in both languages', () => {
    for (const id of ['clinic_contact', 'call_for_help', 'proxy_reply', 'cost_question', 'cancel_by_phone', 'emergency_reply', 'human_handoff', 'slot_clarify'] as const) {
      for (const lang of ['en', 'es'] as const) expect(renderTemplate(id, lang, v).segments, `${id}/${lang}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('booked confirmation (owner wording, phone test 2026-11-27)', () => {
  const v = {
    appointment_date_time: 'Fri, Dec 11 at 9:00 AM', clinic_name: 'Rhode Island Free Clinic',
    clinic_phone: '(401) 274-6347', clinic_address: DEFAULT_CLINIC_ADDRESS,
  };
  it('names the time, clinic, address and phone, and does not invite changes by text', () => {
    expect(renderTemplate('booked_confirmation', 'en', v).text).toBe(
      'Your appointment is confirmed for Fri, Dec 11 at 9:00 AM at Rhode Island Free Clinic. We are located at '
      + '655 Broad Street, 3rd Floor, Providence, RI 02907. If you have any questions please call (401) 274-6347 during regular business hours.');
    for (const lang of ['en', 'es'] as const) {
      const r = renderTemplate('booked_confirmation', lang, v);
      expect(r.text).not.toMatch(/\{\{|Reply here|Responda a/);
      expect(r.encoding, lang).toBe('GSM-7');
      expect(r.segments, lang).toBeLessThanOrEqual(2);
    }
  });
});

describe('no other open times texts', () => {
  const v = { clinic_phone: '(401) 274-6347' };
  it('fit in one or two GSM-7 texts in both languages', () => {
    for (const id of ['only_times_available', 'no_slot_noted'] as const) {
      for (const lang of ['en', 'es'] as const) {
        const r = renderTemplate(id, lang, v);
        expect(r.encoding, `${id}/${lang}`).toBe('GSM-7');
        expect(r.segments, `${id}/${lang}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
