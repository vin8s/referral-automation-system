// Phase 0 (no fake patients by default) and Phase 5a (Reset demo). FAKE data only.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/server/db/driver';
import { createPgliteDb } from '@/server/db/driver';
import { runMigrations } from '@/server/db/migrate';
import { fakeSeedEnabled, seedIfEmpty } from '@/server/db/seed';
import { KEPT_TABLES, RESET_TABLES, assertDemoResetAllowed, resetDemoData } from '@/server/demoReset';
import { signSession } from '@/server/auth/session';
import type { SessionUser } from '@/lib/auth-types';

const admin: SessionUser = { id: 'mock-admin-alex', name: 'Alex Admin', role: 'admin' };
const ma: SessionUser = { id: 'mock-ma-priya', name: 'Priya MA', role: 'ma' };

// The route reads the session cookie through next/headers.
let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb('memory://');
  await runMigrations(db);
  // The route uses the app's getDb(); point it at this in-memory database.
  (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
});

afterEach(() => { vi.unstubAllEnvs(); });

const n = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

async function seedEverything() {
  await seedIfEmpty(db);
  const { rows: [r] } = await db.query<{ id: string; patient_id: string }>('select id, patient_id from referrals limit 1');
  await db.query(`insert into sms_conversations (referral_id) values ($1) on conflict do nothing`, [r.id]);
  await db.query(`insert into needs_human_items (referral_id, reason_code) values ($1, 'test')`, [r.id]);
  await db.query(`insert into sms_inbound_events (sns_message_id) values ('sns-test-1') on conflict do nothing`);
  await db.query(`insert into messages (referral_id, patient_id, direction, author, body, status, send_after)
                  values ($1, $2, 'outbound', 'ai', 'held text', 'held', now())`, [r.id, r.patient_id]);
  await db.query(`insert into ecw_import_profiles (name, mapping) values ('Test mapping', '{}') on conflict do nothing`);
  const { rows: [imp] } = await db.query<{ id: string }>(
    `insert into ecw_imports (file_name, file_sha256, file_bytes) values ('x.csv', 'abc', 10) returning id`);
  await db.query(`insert into ecw_busy_slots (import_id, local_date, start_min, duration_min) values ($1, '2026-12-01', 600, 30)`, [imp.id]);
  await db.query(`insert into ecw_import_review (import_id, row_number, reason, row_data) values ($1, 1, 'ambiguous', '{}')`, [imp.id]);
  await db.query(`insert into ecw_appointments (appt_key, referral_id, start_at, day, time, category)
                  values ('id:1', $1, now(), 'Tue Dec 1', '10:00 AM', 'scheduled')`, [r.id]);
  await db.query(`insert into practice_settings (id, settings) values ('default', '{"x":1}') on conflict (id) do nothing`);
  await db.query(`update sms_settings set quiet_start = '09:00'`);
  await db.query(`insert into audit_log (actor_role, action, what) values ('admin', 'sms.settings', 'SMS outreach settings updated')`);
  await db.query(`insert into audit_log (actor_role, action, what) values ('admin', 'ecw.upload', 'eCW schedule uploaded')`);
}

describe('SEED_FAKE_DATA (Phase 0)', () => {
  it('is off by default, on only when set, never in production', () => {
    expect(fakeSeedEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(fakeSeedEnabled({ NODE_ENV: 'development', SEED_FAKE_DATA: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(fakeSeedEnabled({ NODE_ENV: 'development', SEED_FAKE_DATA: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(fakeSeedEnabled({ NODE_ENV: 'test', SEED_FAKE_DATA: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(fakeSeedEnabled({ NODE_ENV: 'production', SEED_FAKE_DATA: 'true' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('tests can still opt in to the fake data explicitly', async () => {
    await db.query('truncate referrals, patients cascade');
    expect(await seedIfEmpty(db)).toBe(true);
    expect(await n('referrals')).toBeGreaterThan(0);
  });
});

describe('resetDemoData (Phase 5a)', () => {
  it('lists every table in the schema as either reset or kept', async () => {
    const { rows } = await db.query<{ t: string }>(
      `select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const classified = new Set<string>([...RESET_TABLES, ...KEPT_TABLES, 'audit_log']);
    expect(rows.map(r => r.t).filter(t => !classified.has(t))).toEqual([]);
  });

  it('deletes all per-patient data and keeps settings, mappings and settings audit lines', async () => {
    await seedEverything();
    expect(await n('referrals')).toBeGreaterThan(0);

    const result = await resetDemoData(db, admin);
    expect(result.deleted.referrals).toBeGreaterThan(0);

    for (const t of RESET_TABLES) expect(await n(t), t).toBe(0);

    expect(await n('ecw_import_profiles')).toBe(1);
    expect(await n('practice_settings')).toBe(1);
    expect((await db.query<{ q: string }>(`select quiet_start as q from sms_settings`)).rows[0].q).toBe('09:00');

    const { rows: audit } = await db.query<{ action: string; referral_id: string | null }>(
      'select action, referral_id from audit_log order by created_at');
    expect(audit.every(a => a.referral_id === null)).toBe(true);
    expect(audit.map(a => a.action).sort()).toEqual(['demo.reset', 'sms.settings']);
  });

  it('is refused in production unless DEMO_RESET_ENABLED=true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertDemoResetAllowed()).toThrow(/turned off/);
    await seedIfEmpty(db);
    await expect(resetDemoData(db, admin)).rejects.toThrow(/turned off/);
    expect(await n('referrals')).toBeGreaterThan(0);

    vi.stubEnv('DEMO_RESET_ENABLED', 'true');
    expect(() => assertDemoResetAllowed()).not.toThrow();
  });
});

describe('POST /api/demo/reset', () => {
  const post = async (user: SessionUser | null, body: unknown = { confirm: 'RESET' }) => {
    cookieValue = user ? await signSession(user) : undefined;
    const { POST } = await import('@/app/api/demo/reset/route');
    return POST(new Request('http://localhost:3000/api/demo/reset', {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }), {});
  };

  it('signed out → 401, MA → 403 (nothing deleted)', async () => {
    await seedIfEmpty(db);
    expect((await post(null)).status).toBe(401);
    expect((await post(ma)).status).toBe(403);
    expect(await n('referrals')).toBeGreaterThan(0);
  });

  it('admin without the confirm word → 400; with it → 200 and empty', async () => {
    await seedIfEmpty(db);
    expect((await post(admin, { confirm: 'reset please' })).status).toBe(400);
    expect(await n('referrals')).toBeGreaterThan(0);
    const res = await post(admin);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(await n('referrals')).toBe(0);
    expect(await n('patients')).toBe(0);
  });

  it('production without DEMO_RESET_ENABLED → 403 for an admin', async () => {
    await seedIfEmpty(db);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'test-secret-test-secret-test-secret-1234');
    const res = await post(admin);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/DEMO_RESET_ENABLED/);
    expect(await n('referrals')).toBeGreaterThan(0);
  });
});
