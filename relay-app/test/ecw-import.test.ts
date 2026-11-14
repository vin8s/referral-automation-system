// eCW import end to end on an in-memory Postgres with the real migrations and the FAKE
// seed: upload the sample export → dry-run preview → apply → re-import (idempotent) →
// review decisions → cancellation re-entry into SMS outreach.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx';
import { createPgliteDb, type Db } from '@/server/db/driver';
import { runMigrations } from '@/server/db/migrate';
import { seedIfEmpty, truncateAll } from '@/server/db/seed';
import * as svc from '@/server/import/service';
import { parseScheduleFile } from '@/server/import/parse';
import { afterAppointmentCancelled } from '@/server/sms/engine';
import { runOutreachTick } from '@/server/sms/outreach';
import { takenSlots } from '@/server/sms/repo';
import type { SessionUser } from '@/lib/auth-types';
import { harness, outbound } from './sms-harness';

const SAMPLE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ecw-appointments-sample.csv'));
const MA: SessionUser = { id: 'mock-ma-priya', name: 'Priya Anand', role: 'ma' };
const NOW = new Date('2026-11-13T10:00:00-08:00');  // Friday 10 am clinic time

let db: Db;
let ctx: svc.ImportCtx;

beforeAll(async () => {
  db = await createPgliteDb('memory://');
  await runMigrations(db);
});

beforeEach(async () => {
  await truncateAll(db);
  await db.query(`update sms_settings set texting_paused = false`);
  await seedIfEmpty(db);
  ctx = { db, now: () => NOW, tz: 'America/Los_Angeles' };
});

const state = async (id: string) => (await db.query<{ state: string }>(`select state from referrals where id = $1`, [id])).rows[0].state;
const confirmed = async (id: string) => (await db.query<{ day: string; time: string; visit_status: string | null; confirmed_by: string; source: string }>(
  `select day, time, visit_status, confirmed_by, source from appointments where referral_id = $1 and status = 'confirmed'`, [id])).rows;
const amber = async (id: string) => (await db.query<{ reason_code: string }>(
  `select reason_code from needs_human_items where referral_id = $1 and resolved_at is null`, [id])).rows.map(r => r.reason_code);
const count = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0].n;

const EXPECTED = { total: 20, matched: 9, booked: 3, updated: 1, visits: 1, reentered: 3, review: 4, ignored: 6, invalid: 1, unchanged: 1 };

async function uploadAndApply() {
  const draft = await svc.createDraft(ctx, MA, { name: 'appointments.csv', bytes: SAMPLE });
  return svc.applyDraft(ctx, MA, draft.importId, draft.mapping, draft.options);
}

describe('upload + preview (dry run)', () => {
  it('auto-maps the sample, previews every row and changes nothing', async () => {
    const before = await count(`select count(*)::int as n from audit_log where action like 'ecw.%' and action <> 'ecw.upload'`);
    const draft = await svc.createDraft(ctx, MA, { name: 'appointments.csv', bytes: SAMPLE });
    expect(draft.problems).toEqual([]);
    expect(draft.mapping).toMatchObject({ apptDate: 'Appointment Date', apptTime: 'Start Time', patientName: 'Patient Name', mrn: 'Account No', status: 'Status' });
    expect(draft.preview!.counts).toEqual(EXPECTED);
    expect(draft.preview!.rangeStart).toBe('Apr 14, 2026');
    expect(draft.preview!.rangeEnd).toBe('Nov 20, 2026');
    const byRow = new Map(draft.preview!.rows.map(r => [r.patient, r]));
    expect(byRow.get('OKAFOR, JAMES')).toMatchObject({ referralId: 'REF-1042', matchLabel: 'MRN', action: 'book' });
    expect(byRow.get('Klein, Robert')).toMatchObject({ referralId: 'REF-1039', matchLabel: 'DOB + name', confidence: 'high', action: 'book' });
    expect(byRow.get('Bell, Mark')).toMatchObject({ referralId: 'REF-1091', matchLabel: 'DOB + phone', confidence: 'medium', action: 'update_time' });
    expect(byRow.get('Delgado, Maria')!.candidates!.map(c => c.referralId).sort()).toEqual(['REF-1051', 'REF-1093']);
    expect(byRow.get('Walsh, Patty')).toMatchObject({ action: 'review', candidates: [{ referralId: 'REF-1063' }] });
    expect(byRow.get('Briggs, Walter')).toMatchObject({ action: 'review' });
    // Dry run: nothing changed.
    expect(await state('REF-1042')).toBe('Pending Confirmation');
    expect(await state('REF-1033')).toBe('Booked');
    expect(await count(`select count(*)::int as n from audit_log where action like 'ecw.%' and action <> 'ecw.upload'`)).toBe(before);
  });

  it('re-previews with an adjusted mapping (e.g. MRN column unmapped)', async () => {
    const draft = await svc.createDraft(ctx, MA, { name: 'appointments.csv', bytes: SAMPLE });
    const again = await svc.previewDraft(ctx, draft.importId, { ...draft.mapping, mrn: null }, draft.options);
    const okafor = again.preview!.rows.find(r => r.patient === 'OKAFOR, JAMES')!;
    expect(okafor.matchLabel).toBe('DOB + name');
    expect((await svc.previewDraft(ctx, draft.importId, { apptDate: 'Appointment Date' }, draft.options)).problems.length).toBeGreaterThan(0);
  });
});

describe('apply', () => {
  it('books, updates, records visits, re-enters outreach and creates review items', async () => {
    const { result, followUps } = await uploadAndApply();
    expect(result).toMatchObject({ success: true, counts: EXPECTED, openReview: 4 });

    // Booked via eCW (Pending Confirmation for a different time → eCW time; captured slot resolved).
    expect(await state('REF-1042')).toBe('Booked');
    expect(await confirmed('REF-1042')).toEqual([{ day: 'Mon Nov 16', time: '9:00 AM', visit_status: null, confirmed_by: 'Priya Anand (eCW import)', source: 'ecw_import' }]);
    expect(await count(`select count(*)::int as n from appointments where referral_id = 'REF-1042' and status = 'captured'`)).toBe(0);
    expect(await state('REF-1039')).toBe('Booked');
    expect(await state('REF-1070')).toBe('Booked');
    const { rows: audit } = await db.query<{ what: string; actor_name: string }>(`select what, actor_name from audit_log where referral_id = 'REF-1070' and action = 'ecw.book'`);
    expect(audit[0]).toMatchObject({ actor_name: 'Priya Anand' });
    expect(audit[0].what).toMatch(/^Booked via eCW import by Priya Anand — Tue Nov 17 2:00 PM/);

    // Time changed in eCW.
    expect(await confirmed('REF-1091')).toMatchObject([{ day: 'Tue Nov 17', time: '9:00 AM' }]);

    // Visit recorded.
    expect(await confirmed('REF-1088')).toMatchObject([{ visit_status: 'completed' }]);
    expect(await state('REF-1088')).toBe('Booked');

    // Cancelled → In Progress (texted by the SMS follow-up); no-show / rescheduled → In Progress + amber, texting paused.
    expect(await state('REF-1033')).toBe('In Progress');
    expect(await confirmed('REF-1033')).toEqual([]);
    expect(await state('REF-1086')).toBe('In Progress');
    expect(await amber('REF-1086')).toContain('ecw_no_show');
    expect(await state('REF-1087')).toBe('In Progress');
    expect(await amber('REF-1087')).toContain('ecw_rescheduled');
    const { rows: conv } = await db.query<{ paused: boolean; paused_reason: string }>(`select paused, paused_reason from sms_conversations where referral_id = 'REF-1086'`);
    expect(conv[0]).toEqual({ paused: true, paused_reason: 'amber:ecw_no_show' });

    // Untouched.
    expect(await state('REF-1090')).toBe('Booked');
    expect(await state('REF-1047')).toBe('Escalated');
    expect(await state('REF-1051')).toBe('In Progress');

    expect(followUps).toEqual(expect.arrayContaining([
      { referralId: 'REF-1033', kind: 'cancelled' },
      { referralId: 'REF-1042', kind: 'booked_from_pending' },
      { referralId: 'REF-1039', kind: 'booked_from_pending' },
    ]));

    // Review list, raw rows dropped, unmatched patients not stored.
    expect(await count(`select count(*)::int as n from ecw_import_review where status = 'open'`)).toBe(4);
    expect(await count(`select count(*)::int as n from ecw_imports where raw_rows is not null`)).toBe(0);
    expect(await count(`select count(*)::int as n from ecw_appointments where referral_id is null`)).toBe(0);
    const { rows: stored } = await db.query<{ row_data: unknown }>(`select row_data from ecw_import_review`);
    expect(JSON.stringify(stored)).not.toMatch(/Nguyen|Garcia|Okoro/);

    // eCW busy times now block Relay's offered slots (default: providers of matched rows only).
    const taken = await takenSlots(db);
    expect(taken).toContainEqual({ day: 'Mon Nov 16', time: '2:00 PM' });     // Garcia — not a referral, but Dr. Park is busy
    expect(taken).not.toContainEqual({ day: 'Wed Nov 18', time: '4:00 PM' }); // Ortiz NP sees no referral patients
  });

  it('re-uploading the same file changes nothing twice', async () => {
    await uploadAndApply();
    const appts = await count(`select count(*)::int as n from appointments`);
    const audits = await count(`select count(*)::int as n from audit_log where referral_id is not null`);
    const draft = await svc.createDraft(ctx, MA, { name: 'appointments.csv', bytes: SAMPLE });
    expect(draft.alreadyApplied).toMatchObject({ by: 'Priya Anand' });
    const { result, followUps } = await svc.applyDraft(ctx, MA, draft.importId, draft.mapping, draft.options);
    expect(result.counts).toMatchObject({ booked: 0, updated: 0, visits: 0, reentered: 0, review: 4 });
    expect(followUps).toEqual([]);
    expect(await count(`select count(*)::int as n from appointments`)).toBe(appts);
    expect(await count(`select count(*)::int as n from audit_log where referral_id is not null`)).toBe(audits);
    expect(await count(`select count(*)::int as n from ecw_import_review`)).toBe(4);   // no duplicate review items
    expect(await state('REF-1033')).toBe('In Progress');
  });

  it('cannot apply the same draft twice; discarded drafts drop their rows', async () => {
    const draft = await svc.createDraft(ctx, MA, { name: 'a.csv', bytes: SAMPLE });
    await svc.applyDraft(ctx, MA, draft.importId, draft.mapping, draft.options);
    await expect(svc.applyDraft(ctx, MA, draft.importId, draft.mapping, draft.options)).rejects.toMatchObject({ status: 409 });
    const d2 = await svc.createDraft(ctx, MA, { name: 'b.csv', bytes: SAMPLE });
    await svc.discardDraft(ctx, MA, d2.importId);
    expect(await count(`select count(*)::int as n from ecw_imports where raw_rows is not null`)).toBe(0);
  });

  it('saves the mapping as a profile and reuses it for the next upload', async () => {
    const draft = await svc.createDraft(ctx, MA, { name: 'a.csv', bytes: SAMPLE });
    const mapping = { ...draft.mapping, phone: null };
    await svc.applyDraft(ctx, MA, draft.importId, mapping, draft.options, 'eCW daily report');
    const next = await svc.createDraft(ctx, MA, { name: 'b.csv', bytes: SAMPLE });
    expect(next.profileName).toBe('eCW daily report');
    expect(next.mapping.phone).toBeUndefined();
    const overview = await svc.getOverview(ctx);
    expect(overview.profiles.map(p => p.name)).toEqual(['eCW daily report']);
  });
});

describe('review list', () => {
  it('staff pick the referral for an ambiguous row; re-imports then follow that choice', async () => {
    const { result } = await uploadAndApply();
    const detail = (await svc.getImportDetail(ctx, result.importId!))!;
    const delgado = detail.review.find(r => r.row.patient === 'Delgado, Maria')!;
    expect(delgado.reasonLabel).toBe('More than one referral matches');
    const r = await svc.resolveReview(ctx, MA, delgado.id, 'match', 'REF-1093');
    expect(r.result.success).toBe(true);
    expect(await state('REF-1093')).toBe('Booked');
    expect(await state('REF-1051')).toBe('In Progress');

    const walsh = detail.review.find(x => x.row.patient === 'Walsh, Patty')!;
    await svc.resolveReview(ctx, MA, walsh.id, 'ignore');
    await expect(svc.resolveReview(ctx, MA, walsh.id, 'ignore')).rejects.toMatchObject({ status: 409 });

    const escalated = detail.review.find(x => x.row.patient === 'Briggs, Walter')!;
    await expect(svc.resolveReview(ctx, MA, escalated.id, 'match', 'REF-1047')).rejects.toMatchObject({ status: 409 });

    // Re-import: Delgado now matches REF-1093 (linked), Walsh stays ignored → 2 review rows left, no new items.
    const again = await uploadAndApply();
    expect(again.result.counts).toMatchObject({ booked: 0, review: 2 });
    expect(await count(`select count(*)::int as n from ecw_import_review`)).toBe(4);
  });
});

describe('cancellation re-enters SMS outreach', () => {
  it('sends cancellation_reoffer once, counts it toward the cap, and the cadence continues', async () => {
    await uploadAndApply();
    const h = harness(db);
    h.setNow('2026-11-13T10:30:00-08:00');
    expect(await afterAppointmentCancelled(h.deps, 'REF-1033')).toBe('delivered');
    const sent = (await outbound(db, 'REF-1033')).filter(m => m.status !== 'suppressed');
    expect(sent.map(m => m.template_key)).toEqual(['cancellation_reoffer']);
    expect(sent[0].body).toContain('no longer on our schedule');
    const { rows } = await db.query<{ outreach_count: number; cycle_step: number; identity_verified: boolean }>(
      `select outreach_count, cycle_step, identity_verified from sms_conversations where referral_id = 'REF-1033'`);
    expect(rows[0]).toEqual({ outreach_count: 1, cycle_step: 1, identity_verified: false });

    // The outreach tick does not double-text the same day; follow_up_1 comes on day 2.
    await runOutreachTick(h.deps);
    expect((await outbound(db, 'REF-1033')).filter(m => m.status !== 'suppressed')).toHaveLength(1);
    h.setNow('2026-11-16T10:00:00-08:00');
    await runOutreachTick(h.deps);
    expect((await outbound(db, 'REF-1033')).filter(m => m.status !== 'suppressed').map(m => m.template_key)).toEqual(['cancellation_reoffer', 'follow_up_1']);
  });

  it('no-show re-entry stays paused (amber) — the tick does not text', async () => {
    await uploadAndApply();
    const h = harness(db);
    await runOutreachTick(h.deps);
    expect((await outbound(db, 'REF-1086')).filter(m => m.status !== 'suppressed')).toEqual([]);
  });

  it('lifetime cap already used → amber item instead of a text', async () => {
    await uploadAndApply();
    await db.query(`update sms_conversations set outreach_count = 6 where referral_id = 'REF-1033'`);
    const h = harness(db);
    expect(await afterAppointmentCancelled(h.deps, 'REF-1033')).toBe('amber');
    expect(await amber('REF-1033')).toContain('ecw_cancelled');
  });
});

describe('status + files', () => {
  it('reports a stale schedule until an import is applied', async () => {
    expect(await svc.getStatus(ctx)).toMatchObject({ stale: true, never: true });
    await uploadAndApply();
    expect(await svc.getStatus(ctx)).toMatchObject({ stale: false, never: false, hoursAgo: 0, openReview: 4 });
    const later = { ...ctx, now: () => new Date(NOW.getTime() + 25 * 3600_000) };
    expect(await svc.getStatus(later)).toMatchObject({ stale: true, hoursAgo: 25 });
  });

  it('reads .xlsx exports with real date/time cells and title rows', async () => {
    // Excel stores dates as serial numbers with a date format, and times as day fractions.
    const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400_000;
    const ws = xlsxUtils.aoa_to_sheet([
      ['Appointment Report'],
      ['Appt Date', 'Appt Time', 'Patient Name', 'DOB', 'Acct No', 'Status'],
      [0, 0, 'Okafor, James', 0, 201042, 'Scheduled'],
    ]);
    ws.A3 = { t: 'n', v: serial(2026, 11, 17), z: 'm/d/yyyy' };
    ws.B3 = { t: 'n', v: 0.4375, z: 'h:mm AM/PM' };
    ws.D3 = { t: 'n', v: serial(1959, 3, 12), z: 'm/d/yyyy' };
    const wb = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = xlsxWrite(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const parsed = await parseScheduleFile('report.xlsx', buf);
    expect(parsed.headers).toEqual(['Appt Date', 'Appt Time', 'Patient Name', 'DOB', 'Acct No', 'Status']);
    // Formatted date cells arrive as dates, unformatted ones as serial numbers: both are understood.
    expect(parsed.rows[0][0]).toMatch(/^(2026-11-17|46343)$/);
    expect(parsed.rows[0][4]).toBe('201042');
    const draft = await svc.createDraft(ctx, MA, { name: 'report.xlsx', bytes: buf });
    expect(draft.preview!.rows[0]).toMatchObject({ referralId: 'REF-1042', action: 'book', time: '10:30 AM', date: 'Tue, Nov 17, 2026', dob: '03/12/1959' });
  });

  it('rejects other file types and oversized files', async () => {
    await expect(parseScheduleFile('report.pdf', Buffer.from('x'))).rejects.toThrow(/\.csv or \.xlsx/);
    await expect(parseScheduleFile('report.xlsx', Buffer.from('not a zip'))).rejects.toThrow(/not a valid \.xlsx/);
    await expect(parseScheduleFile('big.csv', Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 MB/);
  });
});
