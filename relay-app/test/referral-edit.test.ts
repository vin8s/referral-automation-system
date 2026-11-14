// Manual referral edits (PATCH /api/referrals/:id) and ingest input handling. FAKE patients only.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { addReferral, testDb } from './sms-harness';
import { mdyToIso, sanitizeDraft, sanitizeIngestRow, updateReferral } from '@/server/referrals';
import type { SessionUser } from '@/lib/auth-types';

const ma: SessionUser = { id: 'u-ma', name: 'Test MA', role: 'ma' };

let db: Db;

async function verifiedConv(referralId: string) {
  await db.query(
    `insert into sms_conversations (referral_id, identity_verified, identity_verified_at, identity_attempts)
     values ($1, true, now(), 1)`, [referralId]);
}

async function identity(referralId: string) {
  const { rows } = await db.query<{ identity_verified: boolean; identity_attempts: number }>(
    'select identity_verified, identity_attempts from sms_conversations where referral_id = $1', [referralId]);
  return rows[0];
}

describe('updateReferral: identity check does not survive a phone / DOB change', () => {
  beforeEach(async () => {
    db = await testDb();
    // updateReferral uses the app's getDb(); point it at the in-memory test database.
    (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
  });

  it('a new phone number clears identity_verified and is audit-logged', async () => {
    const id = await addReferral(db, { phone: '+14155550199' });
    await verifiedConv(id);
    expect((await updateReferral(id, { phone: '(415) 555-0123' }, undefined, ma)).success).toBe(true);
    expect(await identity(id)).toEqual({ identity_verified: false, identity_attempts: 0 });
    const { rows } = await db.query<{ action: string }>(`select action from audit_log where referral_id = $1`, [id]);
    expect(rows.map(r => r.action)).toContain('sms.identity_reset');
  });

  it('a corrected DOB clears identity_verified', async () => {
    const id = await addReferral(db, { dob: '1980-03-04' });
    await verifiedConv(id);
    await updateReferral(id, { dateOfBirth: '03/05/1980' }, undefined, ma);
    expect((await identity(id)).identity_verified).toBe(false);
  });

  it('the same number in another format, or a name-only edit, keeps the verification', async () => {
    const id = await addReferral(db, { phone: '+14155550199' });
    await verifiedConv(id);
    await updateReferral(id, { phone: '415-555-0199', patientName: 'Grace T. Testpatient' }, undefined, ma);
    expect((await identity(id)).identity_verified).toBe(true);
  });
});

describe('mdyToIso', () => {
  it('accepts real MM/DD/YYYY dates only', () => {
    expect(mdyToIso('3/4/1980')).toBe('1980-03-04');
    expect(mdyToIso('02/29/2024')).toBe('2024-02-29');
    expect(mdyToIso('13/45/1980')).toBeNull();
    expect(mdyToIso('02/30/1980')).toBeNull();
    expect(mdyToIso('1980-03-04')).toBeNull();
  });

  it('an impossible DOB in a manual edit is ignored instead of crashing the request', async () => {
    db = await testDb();
    (globalThis as unknown as { __relayDb?: Promise<Db> }).__relayDb = Promise.resolve(db);
    const id = await addReferral(db, { dob: '1980-03-04' });
    expect((await updateReferral(id, { dateOfBirth: '13/45/1980' }, undefined, ma)).success).toBe(true);
  });
});

describe('input sanitizing', () => {
  it('sanitizeDraft keeps only known string fields, trimmed and capped', () => {
    const d = sanitizeDraft({ phone: '  555 ', reason: 'x'.repeat(5000), patientName: { $evil: 1 }, extra: 'nope', priority: 7 });
    expect(d).toEqual({ phone: '555', reason: 'x'.repeat(1000) });
  });

  it('sanitizeIngestRow coerces types and never assumes consent', () => {
    const r = sanitizeIngestRow({ patientName: ' Test Person ', phone: 5551234567, smsConsent: 'yes', priority: 'URGENT', sex: 'X', note: 'drop' });
    expect(r.patientName).toBe('Test Person');
    expect(r.phone).toBe('');           // not a string → rejected (row is skipped)
    expect(r.smsConsent).toBe(false);
    expect(r.priority).toBe('normal');
    expect(r).not.toHaveProperty('note');
  });
});
