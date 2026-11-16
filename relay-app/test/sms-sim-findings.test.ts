// Regressions for problems found by the Bedrock fake-patient run (test/sms-bedrock-sims.test.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { handleInbound } from '@/server/sms/engine';
import { runOutreachTick } from '@/server/sms/outreach';
import { detectEmergency, validateModelOutput } from '@/server/sms/guards';
import { renderTemplate } from '@/server/sms/templates';
import { specialtyPhrase } from '@/server/sms/specialty';
import { addReferral, harness, openAmber, outbound, testDb, turn, type Harness } from './sms-harness';

const PHONE = '+14155550199';
let db: Db;
let ref: string;
beforeEach(async () => { db = await testDb(); ref = await addReferral(db); });
const say = (h: Harness, body: string) => handleInbound(h.deps, { from: PHONE, body, provider: 'mock' });
const sent = async () => (await outbound(db, ref)).filter(m => m.status !== 'suppressed').map(m => m.template_key ?? m.author);

describe('blocked AI reply before identity is verified', () => {
  it('sends the date-of-birth request instead of pausing, and the next correct DOB still verifies', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    // The AI echoes the typed date back: blocked by the outbound guard.
    h.model.script = () => turn({ intent: 'identity_response', reply_text: 'Thanks! Is your birthday 02/28/198?' });
    await say(h, '02/28/198');
    expect(await sent()).toEqual(['first_outreach', 'identity_ask']);
    expect(await openAmber(db, ref)).toEqual([]);
    h.model.script = () => turn({ intent: 'identity_response' });
    await say(h, 'sorry 03/04/1980');
    expect((await sent()).at(-1)).toBe('slot_offer');
  });
});

describe('indirect hopelessness is a crisis (red), not amber', () => {
  it.each([
    "honestly I don't see the point of any of this anymore. nothing is going to get better",
    'nothing will ever get better',
    'everyone would be better off without me',
    'ya no aguanto, nada va a mejorar',
  ])('%s', text => expect(detectEmergency(text)?.code).toBe('suicide_self_harm'));
  it('does not fire on ordinary scheduling talk', () => {
    expect(detectEmergency('I dont see the point of a 9am, can we do later?')).toBeNull();
    expect(detectEmergency('my knee is getting better')).toBeNull();
  });
});

describe('model output with an unknown intent label', () => {
  it('is kept (intent becomes other) instead of failing the whole turn', () => {
    const raw = { ...turn(), intent: 'distress_non_emergency' };
    const v = validateModelOutput(raw);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.output.intent).toBe('other');
  });
});

describe('Spanish templates', () => {
  it('slot_offer with an accented specialty stays within 3 segments', () => {
    const r = renderTemplate('slot_offer', 'es', {
      patient_first_name: 'Rosa', specialty_phrase: specialtyPhrase('Cardiology', 'es'),
      slot_1: 'lunes 16 de nov., 9:00 a. m.', slot_2: 'martes 17 de nov., 10:30 a. m.', slot_3: 'miércoles 18 de nov., 2:00 p. m.',
    });
    expect(r.segments).toBeLessThanOrEqual(3);
  });
  it('slot_captured has no double period after a. m. / p. m.', () => {
    const r = renderTemplate('slot_captured', 'es', { slot_label: 'martes 17 de nov., 10:30 a. m.', clinic_phone: '(555) 555-0123' });
    expect(r.text).not.toMatch(/m\.\./);
    expect(r.text).toContain('10:30 a. m.');
  });
});
