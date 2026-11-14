// Test harness: the real SMS engine against an in-memory Postgres (PGlite) with the
// real migrations, a recording SMS provider, a scripted model and a fake clock.
// FAKE patients only.

import { createPgliteDb, type Db } from '@/server/db/driver';
import { runMigrations } from '@/server/db/migrate';
import type { SmsDeps } from '@/server/sms/engine';
import type { SmsAgentModel } from '@/server/sms/model';
import type { SmsProvider } from '@/server/sms/provider';
import type { ModelInput, SmsTurnOutput } from '@/server/sms/types';

export class RecordingProvider implements SmsProvider {
  readonly name = 'mock' as const;
  sent: { to: string; body: string }[] = [];
  async send(m: { to: string; body: string }) {
    this.sent.push(m);
    return { providerMessageId: `test-${this.sent.length}`, status: 'delivered' as const };
  }
}

export type Script = (input: ModelInput) => unknown;

export class ScriptedModel implements SmsAgentModel {
  readonly name = 'scripted' as const;
  calls: ModelInput[] = [];
  constructor(public script: Script) {}
  async turn(input: ModelInput) {
    this.calls.push(input);
    return this.script(input);
  }
}

/** A complete, schema-valid turn with overrides. */
export function turn(p: Partial<SmsTurnOutput> = {}): SmsTurnOutput {
  return {
    reply_text: null, use_template: null, language: 'en', language_switch_request: null, intent: 'other',
    identity: { dob_candidate: null, says_not_patient: false, says_is_proxy: false },
    captured_slot: null, preferences: null, friction: [],
    escalation: { tier: 'none', reason_code: null, pause_automation: false, staff_summary: null },
    opt_out: false, help_requested: false, wrong_number: false, call_outcome: null, conversation_complete: false,
    ...p,
  };
}

export const red = (code: string, summary = 'Patient reports an emergency.') =>
  ({ tier: 'red' as const, reason_code: code, pause_automation: true, staff_summary: summary });
export const amber = (code: string, pause = true) =>
  ({ tier: 'amber' as const, reason_code: code, pause_automation: pause, staff_summary: `amber ${code}` });

let sharedDb: Promise<Db> | null = null;

/** One in-memory database per test file; wiped between tests. */
export async function testDb(): Promise<Db> {
  if (!sharedDb) {
    sharedDb = (async () => {
      const db = await createPgliteDb('memory://');
      await runMigrations(db);
      return db;
    })();
  }
  const db = await sharedDb;
  await db.query(`truncate audit_log, appointments, call_attempts, messages, sms_conversations, needs_human_items,
    sms_inbound_events, referrals, patients cascade`);
  await db.query(`update sms_settings set texting_paused = false`);
  return db;
}

export interface FakePatient {
  referralId?: string; name?: string; dob?: string | null; phone?: string; language?: string;
  consent?: boolean; state?: string; priority?: string; reason?: string; specialty?: string;
}

export async function addReferral(db: Db, p: FakePatient = {}): Promise<string> {
  const id = p.referralId ?? 'REF-9001';
  const { rows } = await db.query<{ id: string }>(
    `insert into patients (name, date_of_birth, phone, language, sms_consent) values ($1, $2::date, $3, $4, $5) returning id`,
    [p.name ?? 'Grace Testpatient', p.dob === undefined ? '1980-03-04' : p.dob, p.phone ?? '+14155550199',
      p.language ?? 'English', p.consent ?? true]);
  await db.query(
    `insert into referrals (id, patient_id, reason, referring_provider, location, priority, state, specialty)
     values ($1, $2, $3, 'Dr. Example', 'Main St. office', $4, $5, $6)`,
    [id, rows[0].id, p.reason ?? 'Arrhythmia evaluation', p.priority ?? 'normal', p.state ?? 'Queued', p.specialty ?? null]);
  return id;
}

export interface Harness {
  deps: SmsDeps;
  provider: RecordingProvider;
  model: ScriptedModel;
  setNow: (iso: string) => void;
}

export function harness(db: Db, script: Script = () => turn()): Harness {
  const provider = new RecordingProvider();
  const model = new ScriptedModel(script);
  let now = new Date('2026-11-13T10:00:00-08:00'); // Friday 10 am, inside the window
  return {
    provider, model,
    setNow: (iso: string) => { now = new Date(iso); },
    deps: {
      // Each read advances the fake clock by 1 ms so message order is stable.
      db, provider, model, now: () => (now = new Date(now.getTime() + 1)), tz: 'America/Los_Angeles',
      clinicName: 'Community Health Clinic', clinicPhone: '(555) 555-0123',
      providers: ['Dr. Park', 'Dr. Lin'], specialty: 'Cardiology',
    },
  };
}

export async function outbound(db: Db, referralId: string) {
  const { rows } = await db.query<{ template_key: string | null; status: string; body: string; author: string }>(
    `select template_key, status, body, author from messages where referral_id = $1 and direction = 'outbound' order by created_at, id`,
    [referralId]);
  return rows;
}

export async function referralState(db: Db, referralId: string): Promise<string> {
  const { rows } = await db.query<{ state: string }>(`select state from referrals where id = $1`, [referralId]);
  return rows[0].state;
}

export async function openAmber(db: Db, referralId: string): Promise<string[]> {
  const { rows } = await db.query<{ reason_code: string }>(
    `select reason_code from needs_human_items where referral_id = $1 and resolved_at is null order by created_at`, [referralId]);
  return rows.map(r => r.reason_code);
}
