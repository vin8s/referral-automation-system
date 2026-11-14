// Launch-blocker cases from docs/CONVERSATION_TEST_CASES.md, run through the real
// engine + database with a scripted model. Case numbers refer to that file.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { afterSlotConfirmed, afterSlotRejected, handleInbound, staffSend } from '@/server/sms/engine';
import { runOutreachTick } from '@/server/sms/outreach';
import { MockSmsAgentModel } from '@/server/sms/model';
import {
  addReferral, amber, harness, openAmber, outbound, red, referralState, testDb, turn, type Harness,
} from './sms-harness';

const PHONE = '+14155550199';
let db: Db;
let ref: string;

beforeEach(async () => {
  db = await testDb();
  ref = await addReferral(db);
});

const say = (h: Harness, body: string) => handleInbound(h.deps, { from: PHONE, body, provider: 'mock' });
const templates = async () => (await outbound(db, ref)).filter(m => m.status !== 'suppressed').map(m => m.template_key ?? m.author);

async function verify(h: Harness) {
  h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: '1980-03-04', says_not_patient: false, says_is_proxy: false } });
  await say(h, '03/04/1980');
}

describe('outreach + happy path (case 1)', () => {
  it('texts, verifies by DOB, captures the slot for the MA, then confirms', async () => {
    const h = harness(db);
    const tick = await runOutreachTick(h.deps);
    expect(tick.sent).toBe(1);
    expect(await templates()).toEqual(['first_outreach']);
    expect(h.provider.sent[0].body).toContain('(AI)');
    expect(await referralState(db, ref)).toBe('In Progress');

    await verify(h);
    expect(await templates()).toEqual(['first_outreach', 'slot_offer']);
    const offer = h.provider.sent[1].body;
    expect(offer).toMatch(/1\) .+\n2\) .+\n3\) /);

    h.model.script = input => turn({
      intent: 'slot_selected', use_template: 'slot_captured', call_outcome: 'Appointment Accepted',
      captured_slot: { slot_id: input.context.offered_slots[1].slot_id, patient_text: '2' },
    });
    await say(h, '2');
    expect(await templates()).toEqual(['first_outreach', 'slot_offer', 'slot_captured']);
    expect(h.provider.sent[2].body).toContain('not booked yet');
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
    const { rows } = await db.query<{ status: string }>(`select status from appointments where referral_id = $1`, [ref]);
    expect(rows).toEqual([{ status: 'captured' }]);

    // The model never saw the DOB, the referral reason or the specialty (R3.2).
    for (const c of h.model.calls) {
      const s = JSON.stringify(c);
      expect(s).not.toContain('1980-03-04');
      expect(s).not.toMatch(/arrhythmia|cardiology/i);
    }

    // MA confirms (what confirmSlot does) → Booked → booked_confirmation.
    await db.query(`update appointments set status = 'confirmed', confirmed_at = now() where referral_id = $1`, [ref]);
    await db.query(`update referrals set state = 'Booked' where id = $1`, [ref]);
    await afterSlotConfirmed(h.deps, ref);
    expect((await templates()).at(-1)).toBe('booked_confirmation');
  });

  it('MA reject re-offers new times without the rejected slot', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await verify(h);
    let picked = '';
    h.model.script = input => {
      picked = input.context.offered_slots[0].label_en;
      return turn({ captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' }, use_template: 'slot_captured' });
    };
    await say(h, '1');
    const { rows } = await db.query<{ day: string; time: string }>(`select day, time from appointments where referral_id = $1 and status = 'captured'`, [ref]);
    await db.query(`update appointments set status = 'expired' where referral_id = $1`, [ref]);
    await db.query(`update referrals set state = 'In Progress' where id = $1`, [ref]);
    await afterSlotRejected(h.deps, ref, rows[0]);
    expect((await templates()).at(-1)).toBe('slot_offer');
    expect(h.provider.sent.at(-1)!.body).not.toContain(picked);
  });
});

describe('identity (case 11) [BLOCKER]', () => {
  it('two wrong DOBs → identity_not_verified + amber identity_failed, no details shared', async () => {
    const h = harness(db, () => turn({ intent: 'identity_response', identity: { dob_candidate: '1990-01-01', says_not_patient: false, says_is_proxy: false } }));
    await runOutreachTick(h.deps);
    await say(h, '01/01/1990');
    expect((await templates()).at(-1)).toBe('identity_retry');
    await say(h, '02/02/1991');
    expect((await templates()).at(-1)).toBe('identity_not_verified');
    expect(await openAmber(db, ref)).toContain('identity_failed');
    for (const m of h.provider.sent) expect(m.body).not.toMatch(/\b(AM|PM)\b/);
  });
});

describe('red tier [BLOCKER]', () => {
  it('case 14: model red → emergency_reply, Escalated, all texting paused', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    h.model.script = () => turn({ intent: 'emergency', escalation: red('emergency_medical'), use_template: 'emergency_reply' });
    await say(h, 'my chest really hurts right now');
    expect((await templates()).at(-1)).toBe('emergency_reply');
    expect(await referralState(db, ref)).toBe('Escalated');
    h.setNow('2026-11-16T10:00:00-08:00');
    const t = await runOutreachTick(h.deps);
    expect(t.sent).toBe(0);
  });

  it('backstop forces red even when the model says nothing is wrong', async () => {
    const h = harness(db, () => turn({ reply_text: 'Thanks! What day works?' }));
    await runOutreachTick(h.deps);
    await say(h, "i can't breathe");
    expect(await templates()).toEqual(['first_outreach', 'emergency_reply']);
    expect(await referralState(db, ref)).toBe('Escalated');
  });

  it('case 15: safety wins over a slot pick in the same message', async () => {
    const h = harness(db);
    await addReferral(db, { referralId: 'REF-9002', phone: '+14155550198', language: 'Spanish' });
    await runOutreachTick(h.deps);
    h.model.script = () => turn({ intent: 'identity_response', language: 'es', identity: { dob_candidate: '1980-03-04', says_not_patient: false, says_is_proxy: false } });
    await handleInbound(h.deps, { from: '+14155550198', body: '4 de marzo de 1980' });
    h.model.script = input => turn({
      language: 'es', escalation: red('emergency_medical'), use_template: 'emergency_reply',
      captured_slot: { slot_id: input.context.offered_slots[2].slot_id, patient_text: 'lo del jueves me sirve' },
    });
    await handleInbound(h.deps, { from: '+14155550198', body: 'oiga desde la mañana siento el pecho apretado, ¿será normal? lo del jueves me sirve' });
    const msgs = await outbound(db, 'REF-9002');
    expect(msgs.at(-1)!.template_key).toBe('emergency_reply');
    expect(msgs.at(-1)!.body).toContain('llame al 911');
    expect(await referralState(db, 'REF-9002')).toBe('Escalated');
    const { rows } = await db.query(`select 1 from appointments where referral_id = 'REF-9002'`);
    expect(rows).toHaveLength(0);
  });

  it('case 20: crisis → crisis_reply (988); later texts get one short line, no AI call', async () => {
    const h = harness(db, () => turn({ escalation: red('suicide_self_harm'), use_template: 'crisis_reply' }));
    await runOutreachTick(h.deps);
    await say(h, "honestly what's the point i want to kill myself");
    expect(h.provider.sent.at(-1)!.body).toContain('988');
    const calls = h.model.calls.length;
    await say(h, 'whatever');
    expect((await templates()).at(-1)).toBe('red_followup_crisis');
    expect(h.model.calls.length).toBe(calls);
  });

  it('case 25: emergency after opt-out → Escalated, no SMS sent', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await say(h, 'STOP');
    const before = h.provider.sent.length;
    await say(h, "i can't breathe");
    expect(h.provider.sent.length).toBe(before);
    expect(await referralState(db, ref)).toBe('Escalated');
  });

  it('model failure with a backstop match still sends the emergency template', async () => {
    const h = harness(db, () => { throw new Error('timeout'); });
    await runOutreachTick(h.deps);
    await say(h, 'took like 20 of my pills idk');
    expect((await templates()).at(-1)).toBe('emergency_reply');
    expect(await referralState(db, ref)).toBe('Escalated');
  });
});

describe('opt-out, help, wrong number [BLOCKER]', () => {
  it('case 23: STOP → one stop_confirmation, no AI call, nothing after', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await say(h, 'Stop.');
    await say(h, 'STOP');
    expect(await templates()).toEqual(['first_outreach', 'stop_confirmation']);
    expect(h.model.calls).toHaveLength(0);
    h.setNow('2026-11-16T10:00:00-08:00'); // follow_up_1 would be due
    expect((await runOutreachTick(h.deps)).sent).toBe(0);
    await expect(staffSend(h.deps, ref, 'hello', { id: 'u', name: 'MA', role: 'ma' })).rejects.toThrow(/opted out/);
    expect(await templates()).toEqual(['first_outreach', 'stop_confirmation']);
  });

  it('case 24: natural-language opt-out (ES) → stop_confirmation in Spanish', async () => {
    const h = harness(db, () => turn({ language: 'es', intent: 'opt_out', opt_out: true, use_template: 'stop_confirmation' }));
    await db.query(`update patients set language = 'Spanish'`);
    await runOutreachTick(h.deps);
    await say(h, 'ya no me manden mensajes por favor');
    expect(h.provider.sent.at(-1)!.body).toContain('Ya no le enviaremos');
    const { rows } = await db.query<{ sms_opted_out: boolean }>(`select sms_opted_out from patients`);
    expect(rows[0].sms_opted_out).toBe(true);
  });

  it('case 26: HELP / AYUDA → help_reply at any hour, state unchanged', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    h.setNow('2026-11-13T23:00:00-08:00');
    await say(h, 'HELP');
    await say(h, 'AYUDA');
    const msgs = await outbound(db, ref);
    expect(msgs.slice(-2).map(m => [m.template_key, m.status])).toEqual([['help_reply', 'delivered'], ['help_reply', 'delivered']]);
    expect(msgs.at(-1)!.body).toContain('Ayuda');
    expect(await referralState(db, ref)).toBe('In Progress');
  });

  it('case 10: wrong number → wrong_number template, number suppressed, amber', async () => {
    const h = harness(db, () => turn({ language: 'es', wrong_number: true, use_template: 'wrong_number', escalation: amber('wrong_number') }));
    await runOutreachTick(h.deps);
    await say(h, 'número equivocado, no conozco a esa persona');
    const last = h.provider.sent.at(-1)!.body;
    expect(last).not.toContain('Grace');
    expect(await openAmber(db, ref)).toContain('wrong_number');
    h.setNow('2026-11-16T10:00:00-08:00');
    expect((await runOutreachTick(h.deps)).sent).toBe(0);
  });
});

describe('minors and cadence', () => {
  it('case 29: minor on file → no texts at all, amber minor', async () => {
    await db.query(`update patients set date_of_birth = '2011-05-01'`);
    const h = harness(db);
    const t = await runOutreachTick(h.deps);
    expect(t.sent).toBe(0);
    expect(h.provider.sent).toHaveLength(0);
    expect(await openAmber(db, ref)).toEqual(['minor']);
  });

  it('case 39: no reply → 4 texts on days 0/2/5/9 inside the window, then cadence_exhausted, no 5th', async () => {
    const h = harness(db);
    const days = ['2026-11-02', '2026-11-04', '2026-11-07', '2026-11-11', '2026-11-14', '2026-11-16'];
    const counts: number[] = [];
    for (const d of days) {
      h.setNow(`${d}T07:30:00-08:00`); // before the window: nothing goes out
      expect((await runOutreachTick(h.deps)).sent).toBe(0);
      h.setNow(`${d}T09:00:00-08:00`);
      counts.push((await runOutreachTick(h.deps)).sent);
    }
    expect(counts).toEqual([1, 1, 1, 1, 0, 0]);
    expect(await templates()).toEqual(['first_outreach', 'follow_up_1', 'follow_up_2', 'final_attempt']);
    expect(await openAmber(db, ref)).toContain('cadence_exhausted');
  });

  it('a patient reply stops follow-ups', async () => {
    const h = harness(db, () => turn({ reply_text: 'To protect your privacy, please reply with your date of birth (MM/DD/YYYY).' }));
    h.setNow('2026-11-02T09:00:00-08:00');
    await runOutreachTick(h.deps);
    await say(h, 'hi');
    h.setNow('2026-11-04T09:00:00-08:00');
    expect((await runOutreachTick(h.deps)).sent).toBe(0);
  });
});

describe('quiet hours (case 32)', () => {
  it('captures the slot at night but holds the reply until 8 am; emergencies go out at once', async () => {
    const h = harness(db);
    h.setNow('2026-11-17T10:00:00-08:00');
    await runOutreachTick(h.deps);
    await verify(h);
    h.setNow('2026-11-17T22:40:00-08:00');
    h.model.script = input => turn({ captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: 'el martes' }, use_template: 'slot_captured' });
    await say(h, 'perdón la hora, el martes a las 10 está bien');
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
    const msgs = await outbound(db, ref);
    expect(msgs.at(-1)).toMatchObject({ template_key: 'slot_captured', status: 'held' });
    const sentBefore = h.provider.sent.length;

    h.setNow('2026-11-17T23:00:00-08:00');
    h.model.script = () => turn({ escalation: red('emergency_medical'), use_template: 'emergency_reply' });
    await say(h, 'me duele mucho el pecho');
    expect(h.provider.sent.length).toBe(sentBefore + 1);
    expect(h.provider.sent.at(-1)!.body).toContain('911');

    h.setNow('2026-11-18T08:00:00-08:00');
    const t = await runOutreachTick(h.deps);
    expect(t.heldReleased).toBe(1);
  });
});

describe('fail-safes', () => {
  it('invalid model output → amber agent_error, nothing sent', async () => {
    const h = harness(db, () => ({ reply_text: 'hi there' }));
    await runOutreachTick(h.deps);
    await say(h, 'hello?');
    expect(await templates()).toEqual(['first_outreach']);
    expect(await openAmber(db, ref)).toContain('agent_error');
  });

  it('an invalid first answer gets one correction attempt that names the problem', async () => {
    const long = 'x'.repeat(320);
    const h = harness(db, input => input.correction
      ? turn({ reply_text: 'Sorry, could you send that again?', intent: 'other' })
      : turn({ reply_text: long, intent: 'other' }));
    await runOutreachTick(h.deps);
    await say(h, 'hello?');
    const model = h.deps.model as unknown as { calls: { correction?: string }[] };
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].correction).toContain('reply_text too long');
    expect(await openAmber(db, ref)).not.toContain('agent_error');
  });

  it('still fails safe when the correction attempt is also invalid', async () => {
    const h = harness(db, () => turn({ reply_text: 'y'.repeat(320) }));
    await runOutreachTick(h.deps);
    await say(h, 'hello?');
    expect((h.deps.model as unknown as { calls: unknown[] }).calls).toHaveLength(2);
    expect(await templates()).toEqual(['first_outreach']);
    expect(await openAmber(db, ref)).toContain('agent_error');
  });

  it('a captured slot that was never offered → agent_error, no capture', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await verify(h);
    h.model.script = () => turn({ captured_slot: { slot_id: 's_invented', patient_text: 'friday 6pm' }, use_template: 'slot_captured' });
    await say(h, 'friday 6pm');
    expect(await openAmber(db, ref)).toContain('agent_error');
    expect(await referralState(db, ref)).toBe('In Progress');
  });

  it('the outbound guard blocks AI text with a link, DOB, referral detail or phone number', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await verify(h);
    for (const bad of ['Book here: https://example.com', 'We have your DOB as 03/04/1980.', 'This is about your arrhythmia.', 'Call 415-555-0100']) {
      h.model.script = () => turn({ reply_text: bad });
      await db.query(`update sms_conversations set paused = false`);
      await say(h, 'ok');
      expect(h.provider.sent.map(m => m.body)).not.toContain(bad);
    }
    expect(await openAmber(db, ref)).toContain('agent_error');
  });

  it('Pause all texting: the tick sends nothing; STOP is still recorded', async () => {
    const h = harness(db);
    await db.query(`update sms_settings set texting_paused = true`);
    const t = await runOutreachTick(h.deps);
    expect(t).toMatchObject({ paused: true, sent: 0 });
    expect(h.provider.sent).toHaveLength(0);
    await say(h, 'STOP');
    const { rows } = await db.query<{ sms_opted_out: boolean }>(`select sms_opted_out from patients`);
    expect(rows[0].sms_opted_out).toBe(true);
  });

  it('no SMS consent → never texted', async () => {
    await db.query(`update patients set sms_consent = false`);
    const h = harness(db);
    expect((await runOutreachTick(h.deps)).sent).toBe(0);
  });
});

describe('amber tier keeps the referral state (R2)', () => {
  it('case 12: caregiver → human_handoff, amber proxy_or_caregiver, state unchanged, thread paused', async () => {
    const h = harness(db, () => turn({ language: 'es', intent: 'proxy_or_caregiver', escalation: amber('proxy_or_caregiver'), identity: { dob_candidate: null, says_not_patient: false, says_is_proxy: true } }));
    await runOutreachTick(h.deps);
    await say(h, 'soy la hija, mi mamá no sabe usar el celular. ¿para qué es la cita?');
    expect((await templates()).at(-1)).toBe('human_handoff');
    expect(await openAmber(db, ref)).toEqual(['proxy_or_caregiver']);
    expect(await referralState(db, ref)).toBe('In Progress');
    // Paused: the next ordinary message gets no reply.
    h.model.script = () => turn({ reply_text: 'Anything else?' });
    const n = h.provider.sent.length;
    await say(h, 'hola?');
    expect(h.provider.sent.length).toBe(n);
  });

  it('case 8: cost question → amber without pause, scheduling continues', async () => {
    const h = harness(db);
    await runOutreachTick(h.deps);
    await verify(h);
    h.model.script = () => turn({
      reply_text: "I can't answer cost questions, but a staff member will contact you about it. Want to pick a time meanwhile?",
      escalation: amber('cost_insurance_question', false), friction: ['cost'],
    });
    await say(h, "how much is this gonna cost me? i don't have insurance");
    expect((await templates()).at(-1)).toBe('ai');
    h.model.script = input => turn({ captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' }, use_template: 'slot_captured' });
    await say(h, '1');
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
  });
});

describe('mock model (local demo stand-in)', () => {
  it('drives the full happy path deterministically', async () => {
    const h = harness(db);
    h.deps.model = new MockSmsAgentModel();
    await runOutreachTick(h.deps);
    await say(h, '3/4/80');
    await say(h, '2');
    expect(await templates()).toEqual(['first_outreach', 'slot_offer', 'slot_captured']);
    expect(await referralState(db, ref)).toBe('Pending Confirmation');
  });
});
