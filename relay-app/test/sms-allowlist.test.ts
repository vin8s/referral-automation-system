// SMS_ALLOWED_NUMBERS: during phone tests, only the listed numbers are ever texted.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { allowedNumbers, isAllowedNumber } from '@/server/sms/allowlist';
import { runOutreachTick } from '@/server/sms/outreach';
import { addReferral, harness, testDb } from './sms-harness';

const env = (v?: string) => ({ SMS_ALLOWED_NUMBERS: v } as unknown as NodeJS.ProcessEnv);

describe('allowlist parsing', () => {
  it('is off when unset or empty', () => {
    expect(allowedNumbers(env())).toBeNull();
    expect(allowedNumbers(env('  '))).toBeNull();
    expect(isAllowedNumber('+15555550100', env())).toBe(true);
  });
  it('matches on the last 10 digits, any format', () => {
    const e = env('(555) 555-0100, +1 555 555 0199');
    expect(isAllowedNumber('+15555550100', e)).toBe(true);
    expect(isAllowedNumber('555-555-0199', e)).toBe(true);
    expect(isAllowedNumber('+15555550123', e)).toBe(false);
    expect(isAllowedNumber(null, e)).toBe(false);
  });
});

describe('outreach with an allowlist', () => {
  let db: Db;
  const saved = process.env.SMS_ALLOWED_NUMBERS;
  beforeEach(async () => { db = await testDb(); });
  afterEach(() => { if (saved === undefined) delete process.env.SMS_ALLOWED_NUMBERS; else process.env.SMS_ALLOWED_NUMBERS = saved; });

  it('texts nobody whose number is not listed', async () => {
    await addReferral(db);
    process.env.SMS_ALLOWED_NUMBERS = '+15555550000';
    const h = harness(db);
    const t = await runOutreachTick(h.deps);
    expect(t.sent).toBe(0);
    expect(t.skipped['not on test-phone allowlist']).toBe(1);
    expect(h.provider.sent).toHaveLength(0);
  });
});

describe('outreach with the patient on the allowlist', () => {
  it('still texts listed numbers', async () => {
    const db = await testDb();
    await addReferral(db);
    const saved = process.env.SMS_ALLOWED_NUMBERS;
    process.env.SMS_ALLOWED_NUMBERS = '+14155550199';
    try {
      expect((await runOutreachTick(harness(db).deps)).sent).toBe(1);
    } finally {
      if (saved === undefined) delete process.env.SMS_ALLOWED_NUMBERS; else process.env.SMS_ALLOWED_NUMBERS = saved;
    }
  });
});

describe('SMS_TEST_ANY_TIME (phone tests only)', () => {
  it('only applies with an allowlist and outside production', async () => {
    const { testAnyTime } = await import('@/server/sms/schedule');
    const e = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
    // Real provider: only with the test-phone allowlist.
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', SMS_PROVIDER: 'aws' }))).toBe(false);
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', SMS_PROVIDER: 'twilio' }))).toBe(false);
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', SMS_PROVIDER: 'aws', SMS_ALLOWED_NUMBERS: '+15555550100', NODE_ENV: 'production' }))).toBe(false);
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', SMS_PROVIDER: 'aws', SMS_ALLOWED_NUMBERS: '+15555550100', NODE_ENV: 'development' }))).toBe(true);
    expect(testAnyTime(e({ SMS_ALLOWED_NUMBERS: '+15555550100' }))).toBe(false);
    // Mock provider (demos, nothing reaches a phone): 24/7 without an allowlist, never in production.
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', NODE_ENV: 'development' }))).toBe(true);
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', SMS_PROVIDER: 'mock', NODE_ENV: 'development' }))).toBe(true);
    expect(testAnyTime(e({ SMS_TEST_ANY_TIME: 'on', NODE_ENV: 'production' }))).toBe(false);
    expect(testAnyTime(e({ NODE_ENV: 'development' }))).toBe(false);
  });
});
