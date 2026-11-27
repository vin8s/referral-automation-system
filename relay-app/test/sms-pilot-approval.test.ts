// Pilot mode: a referral's first text waits for staff approval; follow-ups do not.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/driver';
import { runOutreachTick } from '@/server/sms/outreach';
import * as repo from '@/server/sms/repo';
import { addReferral, harness, outbound, testDb } from './sms-harness';

let db: Db;
beforeEach(async () => {
  db = await testDb();
  await db.query(`update sms_settings set approval_required = true`);
});

const sentTemplates = async (ref: string) =>
  (await outbound(db, ref)).filter(m => m.status !== 'suppressed').map(m => m.template_key);

describe('pilot mode (staff approval before the first text)', () => {
  it('is on by default for new databases', async () => {
    const { rows } = await db.query<{ d: string }>(
      `select column_default as d from information_schema.columns where table_name = 'sms_settings' and column_name = 'approval_required'`);
    expect(rows[0].d).toBe('true');
  });

  it('does not text an unapproved referral, and texts it once approved', async () => {
    const ref = await addReferral(db);
    const h = harness(db);
    const first = await runOutreachTick(h.deps);
    expect(first.sent).toBe(0);
    expect(first.skipped['awaiting staff approval']).toBe(1);
    expect(await sentTemplates(ref)).toEqual([]);

    const awaiting = await repo.listAwaitingApproval(db);
    expect(awaiting.map(r => r.id)).toEqual([ref]);

    expect(await repo.approveOutreach(db, [ref], 'Priya Anand', h.deps.now())).toEqual([ref]);
    expect(await repo.listAwaitingApproval(db)).toEqual([]);
    expect((await runOutreachTick(h.deps)).sent).toBe(1);
    expect(await sentTemplates(ref)).toEqual(['first_outreach']);
  });

  it('never blocks follow-ups for a referral already in its outreach cycle', async () => {
    const ref = await addReferral(db);
    const h = harness(db);
    await repo.approveOutreach(db, [ref], 'Priya Anand', h.deps.now());
    await runOutreachTick(h.deps);
    // Pilot mode turned on later, approval cleared: the cycle that already started keeps going.
    await db.query(`update referrals set outreach_approved_at = null where id = $1`, [ref]);
    h.setNow('2026-11-16T10:00:00-08:00'); // Monday, day 3 → follow-up 1 is due
    expect((await runOutreachTick(h.deps)).sent).toBe(1);
    expect(await sentTemplates(ref)).toEqual(['first_outreach', 'follow_up_1']);
  });

  it('turning pilot mode off makes first texts automatic again', async () => {
    const ref = await addReferral(db);
    await db.query(`update sms_settings set approval_required = false`);
    expect((await runOutreachTick(harness(db).deps)).sent).toBe(1);
    expect(await sentTemplates(ref)).toEqual(['first_outreach']);
  });
});
