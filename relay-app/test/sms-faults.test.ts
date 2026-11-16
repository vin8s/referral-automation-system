// Fault injection for the inbound SMS path (inbound text → AI turn → reply).
//
// Every case breaks something on purpose — the model, the SMS provider, the
// database, the inbound payload, the timing — and checks the one rule that matters:
// the patient gets a safe reply OR staff get an amber "needs a human" item. Never a
// thrown error out of the engine, never silence, never a duplicate text.
// FAKE patients and 555 numbers only.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db, Queryable } from '@/server/db/driver';
import { handleInbound, sweepUnprocessedInbound } from '@/server/sms/engine';
import { validateModelOutput } from '@/server/sms/guards';
import { coerceToolInput } from '@/server/sms/model';
import { runOutreachTick } from '@/server/sms/outreach';
import { clinicTimeZone } from '@/server/sms/schedule';
import type { SmsProvider } from '@/server/sms/provider';
import {
  addReferral, harness, openAmber, outbound, referralState, testDb, turn, type Harness,
} from './sms-harness';

const PHONE = '+14155550199';
let db: Db;
let ref: string;

beforeEach(async () => {
  db = await testDb();
  ref = await addReferral(db, { state: 'In Progress' });
});

const say = (h: Harness, body: string, extra: { providerMessageId?: string; from?: string } = {}) =>
  handleInbound(h.deps, { from: extra.from ?? PHONE, body, provider: 'mock', providerMessageId: extra.providerMessageId ?? null });

/** Outbound texts that actually went (or will go) to the patient. */
const delivered = async (id = ref) => (await outbound(db, id)).filter(m => !['suppressed', 'failed'].includes(m.status));

async function verify(h: Harness) {
  const prev = h.model.script;
  h.model.script = () => turn({ intent: 'identity_response', identity: { dob_candidate: '1980-03-04', says_not_patient: false, says_is_proxy: false } });
  await say(h, '03/04/1980');
  h.model.script = prev;
}

/** A Db whose queries throw when `fail(sql)` is true (to break one step mid-turn). */
function faultyDb(real: Db, fail: (sql: string) => boolean): Db {
  const wrap = (q: Queryable): Queryable => ({
    async query(text, params) {
      if (fail(text)) throw Object.assign(new Error('injected db failure'), { code: 'XX000' });
      return q.query(text, params);
    },
    exec: sql => q.exec(sql),
  });
  return { ...real, ...wrap(real), kind: real.kind, transaction: fn => real.transaction(tx => fn(wrap(tx))), close: () => real.close() };
}

const never = () => new Promise<never>(() => {});

// ── Model faults ────────────────────────────────────────────────────────────

describe('model faults → amber agent_error, nothing AI-written sent', () => {
  const bad: [string, () => unknown][] = [
    ['throws', () => { throw new Error('boom'); }],
    ['Bedrock ThrottlingException', () => { throw Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' }); }],
    ['returns undefined', () => undefined],
    ['returns a JSON string', () => '{"reply_text": "hi"'],
    ['returns an array', () => [turn()]],
    ['returns a partial object', () => ({ reply_text: 'Hi there' })],
    ['wrong types', () => ({ ...turn(), reply_text: 42, opt_out: 'no', friction: 'none' })],
    ['unknown tier / intent', () => ({ ...turn(), intent: 'book_it', escalation: { tier: 'orange', reason_code: null, pause_automation: false, staff_summary: null } })],
    ['escalation null', () => ({ ...turn(), escalation: null })],
    ['identity null', () => ({ ...turn(), identity: null })],
  ];
  for (const [name, script] of bad) {
    it(name, async () => {
      const h = harness(db, script);
      const r = await say(h, 'hello?');
      expect(r.outcome).toBe('amber agent_error');
      expect(await openAmber(db, ref)).toEqual(['agent_error']);
      expect(await delivered()).toEqual([]);
    });
  }

  it('a model that never answers times out instead of hanging the turn', async () => {
    const h = harness(db, never);
    h.deps.modelTimeoutMs = 50;
    const r = await say(h, 'hello?');
    expect(r.outcome).toBe('amber agent_error');
    expect(await openAmber(db, ref)).toEqual(['agent_error']);
  });

  it('reply over length is corrected once, then sent once', async () => {
    let n = 0;
    const h = harness(db, () => (++n === 1 ? turn({ reply_text: 'x'.repeat(2000) }) : turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' })));
    await say(h, 'hi');
    expect(h.model.calls).toHaveLength(2);
    expect(h.model.calls[1].correction).toMatch(/too long/);
    expect((await delivered()).map(m => m.author)).toEqual(['ai']);
  });

  it('slot_id that was never offered → agent_error, nothing captured', async () => {
    const h = harness(db);
    await verify(h);
    h.model.script = () => turn({ use_template: 'slot_captured', captured_slot: { slot_id: 'made-up', patient_text: '1' } });
    await say(h, '1');
    expect(await openAmber(db, ref)).toContain('agent_error');
    const { rows } = await db.query(`select 1 from appointments where referral_id = $1`, [ref]);
    expect(rows).toHaveLength(0);
  });

  // These used to be SILENT: the turn "succeeded" but nothing went out and no one was told.
  const silent: [string, () => unknown][] = [
    ['empty reply_text', () => turn({ reply_text: '' })],
    ['null reply and no template', () => turn({ reply_text: null, use_template: null })],
    ['slot_offer template before identity is verified', () => turn({ use_template: 'slot_offer' })],
    ['slot_captured template with no captured slot', () => turn({ use_template: 'slot_captured' })],
  ];
  for (const [name, script] of silent) {
    it(`${name} → amber (not silence)`, async () => {
      const h = harness(db, script);
      await say(h, 'hello?');
      expect(await openAmber(db, ref)).toEqual(['agent_error']);
    });
  }

  it('whitespace reply_text before identity is verified → the fixed DOB request (not silence, no pause)', async () => {
    const h = harness(db, () => turn({ reply_text: '   \n ' }));
    await say(h, 'hello?');
    const sent = (await outbound(db, ref)).filter(m => m.status !== 'suppressed').map(m => m.template_key);
    expect(sent).toEqual(['identity_ask']);
    expect(await openAmber(db, ref)).toEqual([]);
  });

  it('an acknowledgement after a captured slot may stay silent', async () => {
    const h = harness(db);
    await verify(h);
    h.model.script = input => turn({ use_template: 'slot_captured', captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' } });
    await say(h, '1');
    h.model.script = () => turn({ intent: 'acknowledgement', reply_text: null });
    await say(h, 'ok thanks');
    expect(await openAmber(db, ref)).toEqual([]);
  });

  it('NUL / control characters in the model reply do not crash the insert', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth\u0000 (MM/DD/YYYY).' }));
    const r = await say(h, 'hi');
    expect(r.outcome).not.toMatch(/error/);
    expect((await delivered()).map(m => m.body)).toEqual(['Please reply with your date of birth (MM/DD/YYYY).']);
  });
});

describe('coerceToolInput (Bedrock tool output repair)', () => {
  it('repairs stringified nested objects, booleans and nulls so the turn validates', () => {
    const good = turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' });
    const mangled = {
      ...good, identity: JSON.stringify(good.identity), escalation: JSON.stringify(good.escalation),
      friction: '[]', opt_out: 'false', captured_slot: 'null', call_outcome: 'null',
    };
    expect(validateModelOutput(mangled).ok).toBe(false);
    expect(validateModelOutput(coerceToolInput(mangled))).toEqual({ ok: true, output: good });
    expect(validateModelOutput(coerceToolInput(JSON.stringify(good)))).toEqual({ ok: true, output: good });
  });

  it('leaves anything else alone', () => {
    expect(coerceToolInput({ a: 1 })).toEqual({ a: 1 });
    expect(coerceToolInput('not json')).toBe('not json');
    expect(coerceToolInput({ identity: '{broken' })).toEqual({ identity: '{broken' });
    expect(coerceToolInput(null)).toBeNull();
  });
});

describe('clinicTimeZone', () => {
  it('falls back instead of throwing on a typo', () => {
    const before = process.env.CLINIC_TIMEZONE;
    process.env.CLINIC_TIMEZONE = 'America/NewYork';
    try {
      expect(clinicTimeZone()).toBe('America/New_York');
      process.env.CLINIC_TIMEZONE = 'America/Chicago';
      expect(clinicTimeZone()).toBe('America/Chicago');
    } finally {
      if (before === undefined) delete process.env.CLINIC_TIMEZONE; else process.env.CLINIC_TIMEZONE = before;
    }
  });
});

// ── Provider faults ─────────────────────────────────────────────────────────

class FailingProvider implements SmsProvider {
  readonly name = 'mock' as const;
  calls = 0;
  constructor(private fail: () => Promise<never> | never) {}
  async send(): Promise<never> { this.calls++; return this.fail(); }
}

describe('provider faults → message marked failed + amber, turn completes', () => {
  const errs: [string, () => never][] = [
    ['ConflictException (destination opted out at AWS)', () => { throw Object.assign(new Error('x'), { name: 'ConflictException' }); }],
    ['CredentialsProviderError', () => { throw Object.assign(new Error('x'), { name: 'CredentialsProviderError' }); }],
    ['network error', () => { throw Object.assign(new Error('socket hang up'), { name: 'Error', code: 'ECONNRESET' }); }],
    ['no MessageId', () => { throw new Error('SendTextMessage returned no MessageId'); }],
  ];
  for (const [name, fail] of errs) {
    it(name, async () => {
      const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
      const p = new FailingProvider(fail);
      h.deps.provider = p;
      const r = await say(h, 'hi');
      expect(p.calls).toBe(1); // tried once, never retried in the same turn (no duplicate risk)
      expect(r.outcome).toBeTruthy();
      expect((await outbound(db, ref)).map(m => m.status)).toEqual(['failed']);
      expect(await openAmber(db, ref)).toEqual(['agent_error']);
    });
  }

  it('a send that never returns times out (marked failed + amber)', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    h.deps.provider = new FailingProvider(never);
    h.deps.sendTimeoutMs = 50;
    await say(h, 'hi');
    expect((await outbound(db, ref)).map(m => m.status)).toEqual(['failed']);
    expect(await openAmber(db, ref)).toEqual(['agent_error']);
  });

  it('a provider that returns no MessageId is still recorded', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    h.deps.provider = { name: 'mock', send: async () => ({ providerMessageId: undefined as unknown as string, status: 'sent' as const }) };
    await say(h, 'hi');
    expect((await outbound(db, ref)).map(m => m.status)).toEqual(['sent']);
    expect(await openAmber(db, ref)).toEqual([]);
  });
});

// ── Database faults mid-turn ────────────────────────────────────────────────

describe('database faults mid-turn', () => {
  it('a failing step after the text is stored → amber, handleInbound does not throw', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    h.deps.db = faultyDb(db, sql => sql.includes('set transcript'));
    await expect(say(h, 'hi')).resolves.toBeTruthy();
    expect(await openAmber(db, ref)).toEqual(['agent_error']);
  });

  it('if even the amber cannot be written, the text is left "processing" and the sweeper raises it later', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    let broken = false;
    h.deps.db = faultyDb(db, sql => broken && !sql.startsWith('insert into messages'));
    // Break the database right after the inbound text is stored.
    const orig = h.deps.db.query.bind(h.deps.db);
    h.deps.db.query = (async (text: string, params?: unknown[]) => {
      const res = await orig(text, params);
      if (text.startsWith('insert into messages')) broken = true;
      return res;
    }) as Db['query'];
    await expect(say(h, 'hi', { providerMessageId: 'in-1' })).resolves.toBeTruthy();
    expect(await openAmber(db, ref)).toEqual([]);

    // Same SNS message retried: de-duped, still no duplicate processing.
    broken = false;
    const h2 = harness(db, () => turn({ reply_text: 'should not be sent' }));
    expect((await say(h2, 'hi', { providerMessageId: 'in-1' })).outcome).toBe('duplicate');
    expect(h2.model.calls).toHaveLength(0);

    // The sweeper (outreach tick) finds the unprocessed text 5+ minutes later.
    h2.setNow('2026-11-13T10:10:00-08:00');
    await runOutreachTick(h2.deps);
    expect(await openAmber(db, ref)).toEqual(['agent_error']);
    expect(await sweepUnprocessedInbound(h2.deps)).toBe(0); // only once
  });
});

// ── Inbound payload faults ──────────────────────────────────────────────────

describe('inbound payloads', () => {
  it('the same provider message delivered twice → one model turn, one reply', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    await say(h, 'hi', { providerMessageId: 'in-7' });
    const r = await say(h, 'hi', { providerMessageId: 'in-7' });
    expect(r.outcome).toBe('duplicate');
    expect(h.model.calls).toHaveLength(1);
    expect(h.provider.sent).toHaveLength(1);
  });

  it('two texts within milliseconds are processed one after the other (no double identity handling)', async () => {
    const h = harness(db, () => turn({ intent: 'identity_response', identity: { dob_candidate: '1999-01-01', says_not_patient: false, says_is_proxy: false } }));
    await Promise.all([say(h, '01/01/1999'), say(h, '1/1/99')]);
    // Two wrong DOBs = attempt 1 then attempt 2 → identity_failed (not two "attempt 1" retries).
    expect(await openAmber(db, ref)).toEqual(['identity_failed']);
    expect((await delivered()).map(m => m.template_key)).toEqual(['identity_retry', 'identity_not_verified']);
    // The second model turn saw the first text and its reply.
    expect(h.model.calls[1].history.map(t => t.role)).toEqual(['user', 'assistant']);
  });

  it('two "1" picks at once never leave two captured appointments', async () => {
    const h = harness(db);
    await verify(h);
    h.model.script = input => turn({ use_template: 'slot_captured', captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' } });
    await Promise.all([say(h, '1'), say(h, '1')]);
    const { rows } = await db.query(`select 1 from appointments where referral_id = $1 and status = 'captured'`, [ref]);
    expect(rows).toHaveLength(1);
  });

  it('a text from an unknown number is stored, nothing sent, no crash', async () => {
    const h = harness(db);
    const r = await say(h, 'hello', { from: '+14155550100' });
    expect(r).toEqual({ referralId: null, outcome: 'unknown number (stored)' });
    expect(h.model.calls).toHaveLength(0);
  });

  it('an empty / non-numeric sender never matches a patient who has no phone on file', async () => {
    await addReferral(db, { referralId: 'REF-9002', phone: '' });
    const h = harness(db);
    for (const from of ['', 'AWS-SHORTCODE', '+1', '12345']) {
      const r = await say(h, 'hello', { from });
      expect(r.referralId).toBeNull();
    }
    expect(h.model.calls).toHaveLength(0);
  });

  it('a number shared by two referrals goes to the most recently texted one', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    const other = await addReferral(db, { referralId: 'REF-9002', name: 'Rosa Testpatient' });
    await db.query(`insert into sms_conversations (referral_id, last_outbound_at) values ($1, now())`, [other]);
    const r = await say(h, 'hi');
    expect(r.referralId).toBe(other);
    expect(h.model.calls[0].patientFirstName).toBe('Rosa');
  });

  const bodies: [string, string][] = [
    ['empty body (MMS with only a picture)', ''],
    ['5,000-character body', 'a'.repeat(5000)],
    ['emoji', '👍👍 yes 😊'],
    ['emoji cut in half at the storage limit', `${'a'.repeat(1999)}😊 tail`],
    ['zero-width characters', 'he​llo‍﻿'],
    ['NUL byte', 'hi\u0000there'],
    ['lone surrogate', 'hi \ud83d there'],
  ];
  for (const [name, body] of bodies) {
    it(`${name} → no crash, reply sent`, async () => {
      const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
      const r = await say(h, body);
      expect(r.outcome).toBe('reply');
      expect(await delivered()).toHaveLength(1);
    });
  }

  it('zero-width characters cannot hide STOP or an emergency', async () => {
    const h = harness(db, () => turn());
    expect((await say(h, 'S​TOP')).outcome).toBe('opted out');
    await db.query(`update patients set sms_opted_out = false`);
    await db.query(`update sms_conversations set paused = false, paused_reason = null`);
    expect((await say(h, 'I can​t bre​athe')).outcome).toMatch(/^red/);
  });
});

// ── Referral / conversation state ───────────────────────────────────────────

describe('state edges', () => {
  it('opted-out patient: stored, nothing sent, no model call', async () => {
    await db.query(`update patients set sms_opted_out = true`);
    const h = harness(db);
    expect((await say(h, 'hello')).outcome).toBe('stored (opted out / suppressed)');
    expect(h.model.calls).toHaveLength(0);
  });

  it('paused thread with no open item → staff still get told the patient replied', async () => {
    const h = harness(db, () => turn({ reply_text: 'hi' }));
    await db.query(`insert into sms_conversations (referral_id, paused, paused_reason) values ($1, true, 'staff')`, [ref]);
    await say(h, 'can someone call me back');
    expect(await delivered()).toEqual([]);
    expect(await openAmber(db, ref)).toEqual(['patient_replied_paused']);
  });

  it('a repeat STOP from an opted-out number stays silent (no second confirmation, no amber)', async () => {
    const h = harness(db);
    await say(h, 'STOP');
    await say(h, 'STOP');
    expect((await delivered()).map(m => m.template_key)).toEqual(['stop_confirmation']);
    expect(await openAmber(db, ref)).toEqual([]);
  });

  it('all texting paused (kill switch): stored, nothing sent, staff told once', async () => {
    await db.query(`update sms_settings set texting_paused = true`);
    const h = harness(db);
    await say(h, 'hello?');
    await say(h, 'anyone there?');
    expect(await delivered()).toEqual([]);
    expect(await openAmber(db, ref)).toEqual(['patient_replied_paused']);
    expect(h.model.calls).toHaveLength(0);
  });

  it('paused thread with an open item → no extra item', async () => {
    const h = harness(db, () => turn({ reply_text: 'hi' }));
    await db.query(`insert into sms_conversations (referral_id, paused, paused_reason) values ($1, true, 'amber:complaint')`, [ref]);
    await db.query(`insert into needs_human_items (referral_id, reason_code, pause_automation) values ($1, 'complaint', true)`, [ref]);
    await say(h, 'hello');
    expect(await openAmber(db, ref)).toEqual(['complaint']);
  });

  it('Booked referral picking a new time → amber appointment_change', async () => {
    const h = harness(db);
    await verify(h);
    await db.query(`update referrals set state = 'Booked' where id = $1`, [ref]);
    h.model.script = input => turn({ use_template: 'slot_captured', captured_slot: { slot_id: input.context.offered_slots[0].slot_id, patient_text: '1' } });
    expect((await say(h, '1')).outcome).toBe('amber appointment_change');
    expect(await referralState(db, ref)).toBe('Booked');
  });

  it('verified patient and no open times at all → amber no_slot_works', async () => {
    const h = harness(db);
    await verify(h);
    // Every slot on the grid is taken.
    await db.query(`update sms_conversations set offered_slots = '[]'::jsonb`);
    await db.query(`insert into ecw_busy_slots (local_date, start_min, duration_min)
      select d::date, 0, 1440 from generate_series('2026-11-01'::date, '2027-01-31'::date, interval '1 day') d`);
    h.model.script = () => turn({ use_template: 'slot_offer' });
    await say(h, 'what times do you have');
    expect(await openAmber(db, ref)).toEqual(['no_slot_works']);
  });

  it('conversation row missing entirely → created on the fly', async () => {
    const h = harness(db, () => turn({ reply_text: 'Please reply with your date of birth (MM/DD/YYYY).' }));
    await db.query(`delete from sms_conversations`);
    expect((await say(h, 'hi')).outcome).toBe('reply');
  });

  for (const iso of ['2026-11-01T01:30:00-07:00', '2026-11-01T01:30:00-08:00', '2026-03-08T02:30:00-08:00', '2026-11-13T23:59:59.900-08:00', '2026-11-14T00:00:30-08:00']) {
    it(`clock edge ${iso} → no crash`, async () => {
      const h = harness(db);
      h.setNow(iso);
      await verify(h);
      h.model.script = () => turn({ reply_text: 'Thanks!' });
      expect((await say(h, 'ok')).outcome).toBeTruthy();
    });
  }
});

// ── Outreach tick resilience ────────────────────────────────────────────────

describe('outreach tick', () => {
  it('one referral that throws does not stop the others', async () => {
    const other = await addReferral(db, { referralId: 'REF-9002', phone: '+14155550142', state: 'Queued' });
    const h = harness(db);
    // Break only the first candidate's attempt row.
    let first = true;
    h.deps.db = faultyDb(db, sql => {
      if (sql.includes('insert into call_attempts') && first) { first = false; return true; }
      return false;
    });
    const r = await runOutreachTick(h.deps);
    expect(r.sent).toBe(1);
    expect(r.skipped['error']).toBe(1);
    expect((await delivered(other)).length + (await delivered(ref)).length).toBe(1);
  });

  it('stops sending for the tick after a provider failure (no hammering a broken provider)', async () => {
    await addReferral(db, { referralId: 'REF-9002', phone: '+14155550142', state: 'Queued' });
    await addReferral(db, { referralId: 'REF-9003', phone: '+14155550143', state: 'Queued' });
    const h = harness(db);
    const p = new FailingProvider(() => { throw Object.assign(new Error('x'), { name: 'CredentialsProviderError' }); });
    h.deps.provider = p;
    await runOutreachTick(h.deps);
    expect(p.calls).toBe(1);
  });
});
