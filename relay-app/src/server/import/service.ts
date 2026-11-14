// eCW schedule import: drafts, dry-run preview, apply, review items, history.
// Every SQL query of the feature lives here. Takes an ImportCtx so tests run the
// real flow against an in-memory database (test/ecw-import.test.ts).
//
// Connector mode: Relay never writes to eCW. Apply only changes Relay's own
// referral state / mirrored appointments, and every change is audit-logged with
// the acting user ("Booked via eCW import by <user>").

import 'server-only';
import { createHash } from 'node:crypto';
import type { Db, Queryable } from '@/server/db';
import type { SessionUser } from '@/lib/auth-types';
import {
  DEFAULT_IMPORT_OPTIONS, guessMapping, importFreshness, mappingProblems, ECW_FIELDS,
  type EcwImportOptions, type EcwMapping,
} from '@/lib/ecwImport';
import { dayKeyOf } from '@/lib/slots';
import type {
  EcwApplyResult, EcwCandidate, EcwImportCounts, EcwImportDetail, EcwImportDraft, EcwImportOverview, EcwImportPreview,
  EcwImportStatus, EcwImportSummary, EcwPreviewRow, EcwReviewItem, ReferralState,
} from '@/lib/types';
import * as smsRepo from '@/server/sms/repo';
import { resetOutreachForReentry } from '@/server/sms/engine';
import { zonedParts, zonedTimeToUtc } from '@/server/sms/schedule';
import { apptKeyOf, CATEGORY_LABEL, fmtTime, normalizeRow, normMrn, phoneKey, type NormRow } from './normalize';
import { parseScheduleFile } from './parse';
import {
  countPlan, planImport, planReferral, TIER_CONFIDENCE, TIER_LABEL, type ActionCode, type PlannedRow, type RefInfo,
} from './plan';

export interface ImportCtx { db: Db; now: () => Date; tz: string; staleHours?: number }

/** Work the import leaves for the SMS engine after the database commit (texts are never sent inside a transaction). */
export interface FollowUp { referralId: string; kind: 'cancelled' | 'booked_from_pending' }

export class ImportError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ImportError'; }
}

const DRAFT_TTL_HOURS = 24;
const MOOT_AMBER_ON_BOOK = ['cadence_exhausted', 'no_slot_works', 'appointment_change', 'ecw_no_show', 'ecw_rescheduled', 'ecw_cancelled'];

export const ACTION_LABEL: Record<ActionCode, string> = {
  book: 'Mark Booked', update_time: 'Update time', record_visit: 'Record visit',
  reenter_cancelled: 'Back to outreach', reenter_no_show: 'Back to outreach · call first',
  reenter_rescheduled: 'Back to outreach · check eCW', none: 'No change', review: 'Needs review',
  ignore: 'Not in Relay', invalid: "Can't read row",
};

export const REVIEW_LABEL: Record<string, string> = {
  ambiguous: 'More than one referral matches', possible_match: 'Possible match',
  mrn_conflict: 'MRN / date of birth conflict', escalated: 'Referral is Escalated', unknown_status: 'Unknown eCW status',
};

// ── Formatting ──────────────────────────────────────────────────────────────

const fmtStamp = (v: Date | string | null, tz: string): string | null =>
  v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) : null;

function fmtIsoDate(iso: string | null, withDow = false): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    ...(withDow ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const isoToMdy = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');
const displayState = (stored: string): ReferralState => stored as ReferralState;

function sanitizeOptions(raw: unknown): EcwImportOptions {
  const r = (raw ?? {}) as Partial<EcwImportOptions>;
  const d = DEFAULT_IMPORT_OPTIONS;
  const dur = Number(r.defaultDurationMin);
  return {
    dateOrder: r.dateOrder === 'DMY' ? 'DMY' : 'MDY',
    nameOrder: r.nameOrder === 'last_first' || r.nameOrder === 'first_last' ? r.nameOrder : 'auto',
    defaultDurationMin: Number.isInteger(dur) && dur >= 5 && dur <= 480 ? dur : d.defaultDurationMin,
    busyProviders: Array.isArray(r.busyProviders)
      ? r.busyProviders.filter((x): x is string => typeof x === 'string').slice(0, 200).map(x => x.slice(0, 120))
      : null,
  };
}

function sanitizeMapping(raw: unknown, headers: string[]): EcwMapping {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: EcwMapping = {};
  for (const { field } of ECW_FIELDS) {
    const v = r[field];
    if (typeof v === 'string' && headers.includes(v)) out[field] = v;
  }
  return out;
}

const jsonOf = <T>(v: unknown, fallback: T): T => {
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};

async function audit(q: Queryable, actor: SessionUser, referralId: string | null, action: string, what: string) {
  await smsRepo.audit(q, smsRepo.staffActor(actor), referralId, action, what);
}

// ── Loading Relay state for matching ────────────────────────────────────────

interface RefRow {
  id: string; state: string; name: string; dob: string | null; mrn: string | null; phone: string | null;
}
interface ApptRow {
  referral_id: string; status: string; day: string; time: string; provider: string | null;
  ecw_appt_key: string | null; visit_status: string | null;
}

async function loadRefInfos(q: Queryable): Promise<RefInfo[]> {
  const [refs, appts] = await Promise.all([
    q.query<RefRow>(
      `select r.id, r.state, p.name, to_char(p.date_of_birth, 'YYYY-MM-DD') as dob, p.mrn, p.phone
         from referrals r join patients p on p.id = r.patient_id`),
    q.query<ApptRow>(
      `select referral_id, status, day, time, provider, ecw_appt_key, visit_status from appointments
        where status in ('captured', 'confirmed') order by captured_at desc`),
  ]);
  const booked = new Map<string, ApptRow>();
  const captured = new Map<string, ApptRow>();
  for (const a of appts.rows) {
    const m = a.status === 'confirmed' ? booked : captured;
    if (!m.has(a.referral_id)) m.set(a.referral_id, a);
  }
  return refs.rows.map(r => {
    const b = booked.get(r.id), c = captured.get(r.id);
    return {
      referralId: r.id, patientName: r.name, dobIso: r.dob, mrn: normMrn(r.mrn), phoneKey: phoneKey(r.phone), state: r.state,
      booked: b ? { day: b.day ?? '', time: b.time ?? '', provider: b.provider ?? '', ecwApptKey: b.ecw_appt_key, visitStatus: b.visit_status } : null,
      captured: c ? { day: c.day ?? '', time: c.time ?? '' } : null,
    };
  });
}

async function loadLinked(q: Queryable, keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const { rows } = await q.query<{ appt_key: string; referral_id: string }>(
    `select appt_key, referral_id from ecw_appointments where appt_key = any($1::text[])`, [keys]);
  return new Map(rows.map(r => [r.appt_key, r.referral_id]));
}

// ── Planning ────────────────────────────────────────────────────────────────

interface Computed {
  plan: PlannedRow[];
  refs: RefInfo[];
  counts: EcwImportCounts;
  rangeStart: string | null;
  rangeEnd: string | null;
  providers: string[];
  defaultBusyProviders: string[];
}

function todayLocal(ctx: ImportCtx): string {
  return zonedParts(ctx.now(), ctx.tz).date;
}

async function compute(q: Queryable, ctx: ImportCtx, headers: string[], raw: string[][], headerRow: number,
  mapping: EcwMapping, options: EcwImportOptions): Promise<Computed> {
  const now = ctx.now();
  const rows = raw.map((cells, i) => {
    const row = normalizeRow(cells, headers, mapping, options, headerRow + 1 + i, now);
    return { row, apptKey: apptKeyOf(row) };
  });
  const [refs, linked] = await Promise.all([
    loadRefInfos(q), loadLinked(q, rows.map(r => r.apptKey).filter((k): k is string => !!k)),
  ]);
  const plan = planImport(rows, refs, linked, todayLocal(ctx));
  // Rows staff already chose to ignore in an earlier import stay ignored.
  const reviewKeys = plan.filter(p => p.action === 'review' && p.apptKey).map(p => p.apptKey!);
  if (reviewKeys.length) {
    const { rows: ignored } = await q.query<{ appt_key: string }>(
      `select distinct appt_key from ecw_import_review where status = 'ignored' and appt_key = any($1::text[])`, [reviewKeys]);
    const set = new Set(ignored.map(r => r.appt_key));
    for (const p of plan) {
      if (p.action === 'review' && p.apptKey && set.has(p.apptKey)) {
        p.action = 'ignore'; p.detail = 'Ignored by staff in an earlier import'; delete p.candidates;
      }
    }
  }
  const dates = rows.map(r => r.row.date).filter((d): d is string => !!d).sort();
  const providers = [...new Set(rows.map(r => r.row.provider).filter((p): p is string => !!p))].sort();
  const defaultBusyProviders = [...new Set(plan.filter(p => p.referralId).map(p => p.row.provider).filter((p): p is string => !!p))].sort();
  return {
    plan, refs, counts: countPlan(plan), rangeStart: dates[0] ?? null, rangeEnd: dates[dates.length - 1] ?? null,
    providers, defaultBusyProviders,
  };
}

function candidatesOf(ids: string[] | undefined, refs: Map<string, RefInfo>): EcwCandidate[] {
  return (ids ?? []).map(id => refs.get(id)).filter((r): r is RefInfo => !!r).map(r => ({
    referralId: r.referralId, patient: r.patientName, dob: isoToMdy(r.dobIso), state: displayState(r.state),
  }));
}

function rowView(p: PlannedRow) {
  return {
    patient: p.row.displayName,
    dob: p.row.dobIso ? isoToMdy(p.row.dobIso) : null,
    mrn: p.row.mrn,
    date: fmtIsoDate(p.row.date, true),
    time: p.row.startMin !== null ? fmtTime(p.row.startMin) : null,
    provider: p.row.provider,
    status: p.row.statusRaw ?? CATEGORY_LABEL[p.row.category],
  };
}

function toPreview(c: Computed): EcwImportPreview {
  const refs = new Map(c.refs.map(r => [r.referralId, r]));
  const rows: EcwPreviewRow[] = c.plan.map(p => {
    const ref = p.referralId ? refs.get(p.referralId) : undefined;
    return {
      rowNumber: p.row.rowNumber,
      ...rowView(p),
      referralId: p.referralId,
      referralPatient: ref?.patientName ?? null,
      referralState: ref ? displayState(ref.state) : null,
      matchLabel: p.tier ? TIER_LABEL[p.tier] : null,
      confidence: p.tier ? TIER_CONFIDENCE[p.tier] : null,
      action: p.action,
      actionLabel: ACTION_LABEL[p.action],
      detail: p.detail,
      ...(p.candidates ? { candidates: candidatesOf(p.candidates, refs) } : {}),
    };
  });
  return {
    rows, counts: c.counts, rangeStart: fmtIsoDate(c.rangeStart), rangeEnd: fmtIsoDate(c.rangeEnd),
    providers: c.providers, defaultBusyProviders: c.defaultBusyProviders,
  };
}

// ── Drafts ──────────────────────────────────────────────────────────────────

interface ImportRow {
  id: string; status: EcwImportSummary['status']; file_name: string; file_sha256: string; row_count: number;
  headers: unknown; raw_rows: unknown; mapping: unknown; options: unknown; profile_id: string | null;
  range_start: string | null; range_end: string | null; counts: unknown;
  created_at: Date; created_by_name: string | null; applied_at: Date | null; applied_by_name: string | null;
  open_review?: number;
}

const IMPORT_COLS = `i.id, i.status, i.file_name, i.file_sha256, i.row_count, i.headers, i.raw_rows, i.mapping, i.options,
  i.profile_id, to_char(i.range_start, 'YYYY-MM-DD') as range_start, to_char(i.range_end, 'YYYY-MM-DD') as range_end,
  i.counts, i.created_at, i.created_by_name, i.applied_at, i.applied_by_name`;

/** Raw cells are only kept while a draft is open; older drafts are expired and emptied. */
async function expireOldDrafts(q: Queryable, now: Date): Promise<void> {
  await q.query(
    `update ecw_imports set status = 'expired', raw_rows = null
      where status = 'draft' and created_at < $1`, [new Date(now.getTime() - DRAFT_TTL_HOURS * 3600_000)]);
}

async function loadDraft(q: Queryable, id: string, forUpdate = false): Promise<ImportRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ImportError(400, 'Bad import id');
  const { rows } = await q.query<ImportRow>(`select ${IMPORT_COLS} from ecw_imports i where i.id = $1 ${forUpdate ? 'for update' : ''}`, [id]);
  const row = rows[0];
  if (!row) throw new ImportError(404, 'Import not found.');
  if (row.status !== 'draft') {
    throw new ImportError(409, row.status === 'applied' ? 'This import was already applied.' : 'This upload expired or was discarded. Upload the file again.');
  }
  return row;
}

interface ProfileRow { id: string; name: string; mapping: unknown; options: unknown; headers: unknown; updated_at: Date; updated_by: string | null }

/** Picks the saved profile whose mapped headers are all present in this file (most recently used first). */
async function pickProfile(q: Queryable, headers: string[]): Promise<ProfileRow | null> {
  const { rows } = await q.query<ProfileRow>(
    `select id, name, mapping, options, headers, updated_at, updated_by from ecw_import_profiles
      order by coalesce(last_used_at, updated_at) desc`);
  for (const p of rows) {
    const mapped = Object.values(jsonOf<EcwMapping>(p.mapping, {})).filter((h): h is string => !!h);
    if (mapped.length && mapped.every(h => headers.includes(h))) return p;
  }
  return null;
}

async function alreadyApplied(q: Queryable, sha: string, tz: string, excludeId: string): Promise<EcwImportDraft['alreadyApplied']> {
  const { rows } = await q.query<{ applied_at: Date; applied_by_name: string | null }>(
    `select applied_at, applied_by_name from ecw_imports where file_sha256 = $1 and status = 'applied' and id <> $2
      order by applied_at desc limit 1`, [sha, excludeId]);
  return rows[0] ? { at: fmtStamp(rows[0].applied_at, tz) ?? '', by: rows[0].applied_by_name ?? 'Staff' } : null;
}

async function draftView(q: Queryable, ctx: ImportCtx, d: ImportRow, mapping: EcwMapping, options: EcwImportOptions, profileName: string | null): Promise<EcwImportDraft> {
  const headers = jsonOf<string[]>(d.headers, []);
  const raw = jsonOf<{ headerRow: number; rows: string[][] }>(d.raw_rows, { headerRow: 1, rows: [] });
  const problems = mappingProblems(mapping);
  const preview = problems.length ? null : toPreview(await compute(q, ctx, headers, raw.rows, raw.headerRow, mapping, options));
  return {
    importId: d.id, fileName: d.file_name, rowCount: d.row_count, headers,
    sample: raw.rows.slice(0, 3), mapping, options, profileName, problems, preview,
    alreadyApplied: await alreadyApplied(q, d.file_sha256, ctx.tz, d.id), timezone: ctx.tz,
  };
}

export async function createDraft(ctx: ImportCtx, actor: SessionUser, file: { name: string; bytes: Buffer }): Promise<EcwImportDraft> {
  const q = ctx.db;
  const now = ctx.now();
  await expireOldDrafts(q, now);
  const parsed = await parseScheduleFile(file.name, file.bytes);
  const sha = createHash('sha256').update(file.bytes).digest('hex');
  const profile = await pickProfile(q, parsed.headers);
  const mapping = profile ? sanitizeMapping(jsonOf(profile.mapping, {}), parsed.headers) : guessMapping(parsed.headers);
  const options = profile ? sanitizeOptions(jsonOf(profile.options, {})) : { ...DEFAULT_IMPORT_OPTIONS };
  const fileName = file.name.replace(/[^\w .()-]/g, '_').slice(0, 120);

  const { rows } = await q.query<ImportRow>(
    `insert into ecw_imports (file_name, file_sha256, file_bytes, row_count, headers, raw_rows, mapping, options, profile_id,
        created_at, created_by_id, created_by_name)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
     returning id, status, file_name, file_sha256, row_count, headers, raw_rows, mapping, options, profile_id,
       null as range_start, null as range_end, counts, created_at, created_by_name, applied_at, applied_by_name`,
    [fileName, sha, file.bytes.length, parsed.rows.length, JSON.stringify(parsed.headers),
      JSON.stringify({ headerRow: parsed.headerRow, rows: parsed.rows }), JSON.stringify(mapping), JSON.stringify(options),
      profile?.id ?? null, now, actor.id, actor.name]);
  await audit(q, actor, null, 'ecw.upload', `eCW schedule uploaded for preview (${parsed.rows.length} rows) — nothing changed yet`);
  return draftView(q, ctx, rows[0], mapping, options, profile?.name ?? null);
}

/** Dry run with the staff's adjusted mapping: nothing changes except the draft's saved mapping. */
export async function previewDraft(ctx: ImportCtx, id: string, rawMapping: unknown, rawOptions: unknown): Promise<EcwImportDraft> {
  const q = ctx.db;
  const d = await loadDraft(q, id);
  const headers = jsonOf<string[]>(d.headers, []);
  const mapping = sanitizeMapping(rawMapping, headers);
  const options = sanitizeOptions(rawOptions);
  await q.query(`update ecw_imports set mapping = $2::jsonb, options = $3::jsonb where id = $1`, [id, JSON.stringify(mapping), JSON.stringify(options)]);
  return draftView(q, ctx, d, mapping, options, null);
}

export async function discardDraft(ctx: ImportCtx, actor: SessionUser, id: string): Promise<void> {
  const q = ctx.db;
  await loadDraft(q, id);
  await q.query(`update ecw_imports set status = 'discarded', raw_rows = null where id = $1`, [id]);
  await audit(q, actor, null, 'ecw.discard', 'eCW schedule upload discarded (not applied)');
}

// ── Executing one planned row ───────────────────────────────────────────────

function slotOf(row: NormRow) {
  const [y, m, d] = row.date!.split('-').map(Number);
  return { day: dayKeyOf(y, m, d), time: fmtTime(row.startMin!) };
}

const VISIT: Partial<Record<NormRow['category'], 'arrived' | 'completed'>> = { arrived: 'arrived', completed: 'completed' };

/** Applies one planned action inside the transaction. Returns follow-ups for the SMS engine. */
async function executeRow(q: Queryable, ctx: ImportCtx, actor: SessionUser, p: PlannedRow, refs: Map<string, RefInfo>): Promise<FollowUp | null> {
  if (!p.referralId) return null;
  const id = p.referralId;
  const ref = refs.get(id);
  const now = ctx.now();
  const by = `${actor.name} (eCW import)`;
  let follow: FollowUp | null = null;

  const book = async (visit: string | null) => {
    const s = slotOf(p.row);
    const prior = ref?.state;
    await q.query(`update appointments set status = 'expired' where referral_id = $1 and status = 'captured'`, [id]);
    await q.query(`update appointments set status = 'cancelled' where referral_id = $1 and status = 'confirmed'`, [id]);
    await q.query(
      `insert into appointments (referral_id, status, day, time, provider, captured_at, confirmed_at, confirmed_by,
          mirror_status, source, ecw_appt_key, visit_status)
       values ($1, 'confirmed', $2, $3, $4, $5, $5, $6, 'mirrored', 'ecw_import', $7, $8)`,
      [id, s.day, s.time, p.row.provider ?? '', now, by, p.apptKey, visit]);
    await q.query(`update referrals set state = 'Booked', updated_at = $2 where id = $1`, [id, now]);
    if (await smsRepo.findConv(q, id)) await smsRepo.updateConv(q, id, { capturedSlotId: null, offeredSlots: [] });
    await smsRepo.suppressHeldTexts(q, id, 'booked via eCW import');
    await q.query(
      `update needs_human_items set resolved_at = $2, resolved_by = $3
        where referral_id = $1 and resolved_at is null and reason_code = any($4::text[])`, [id, now, by, MOOT_AMBER_ON_BOOK]);
    const replaced = prior === 'Pending Confirmation' && ref?.captured ? ` · captured slot ${ref.captured.day} ${ref.captured.time} resolved` : '';
    await audit(q, actor, id, 'ecw.book', `Booked via eCW import by ${actor.name} — ${s.day} ${s.time}${visit ? ` (visit ${visit})` : ''}${replaced}`);
    if (prior === 'Pending Confirmation') follow = { referralId: id, kind: 'booked_from_pending' };
  };

  switch (p.action) {
    case 'book':
      await book(null);
      break;
    case 'update_time': {
      const s = slotOf(p.row);
      await q.query(
        `update appointments set day = $2, time = $3, provider = coalesce($4, provider), ecw_appt_key = $5, mirror_status = 'mirrored'
          where referral_id = $1 and status = 'confirmed'`, [id, s.day, s.time, p.row.provider, p.apptKey]);
      await audit(q, actor, id, 'ecw.update', `Appointment time updated from eCW import by ${actor.name} — ${ref?.booked?.day ?? ''} ${ref?.booked?.time ?? ''} → ${s.day} ${s.time}`.replace(/ {2,}/g, ' '));
      break;
    }
    case 'record_visit': {
      const visit = VISIT[p.row.category] ?? 'arrived';
      if (ref?.state === 'Booked') {
        const s = slotOf(p.row);
        await q.query(
          `update appointments set visit_status = $2, day = $3, time = $4, ecw_appt_key = $5
            where referral_id = $1 and status = 'confirmed'`, [id, visit, s.day, s.time, p.apptKey]);
        await audit(q, actor, id, 'ecw.visit', `Visit recorded from eCW import by ${actor.name} — ${visit === 'completed' ? 'checked out' : 'arrived'} ${s.day} ${s.time}`);
      } else {
        await book(visit);
      }
      break;
    }
    case 'reenter_cancelled': case 'reenter_no_show': case 'reenter_rescheduled': {
      const what = p.action === 'reenter_no_show' ? 'No show' : p.action === 'reenter_rescheduled' ? 'Rescheduled (no new time)' : 'Cancelled';
      await q.query(`update appointments set status = 'cancelled' where referral_id = $1 and status = 'confirmed'`, [id]);
      await q.query(`update referrals set state = 'In Progress', updated_at = $2 where id = $1`, [id, now]);
      await resetOutreachForReentry(q, id);
      if (p.action === 'reenter_cancelled') {
        follow = { referralId: id, kind: 'cancelled' };
      } else {
        // No-show / reschedule: a person calls first (AGENT_SAFETY_RULES R2 amber, texting paused).
        const code = p.action === 'reenter_no_show' ? 'ecw_no_show' : 'ecw_rescheduled';
        const summary = p.action === 'reenter_no_show'
          ? 'Marked No Show in eCW. Call the patient before any text goes out; resume texting from the referral if appropriate.'
          : 'Marked Rescheduled in eCW but no new time was in the import. Check eCW for the new time; resume texting only if there is none.';
        if (await smsRepo.addNeedsHuman(q, id, code, summary, true, now)) {
          await smsRepo.audit(q, smsRepo.SYSTEM_ACTOR, id, 'sms.needs_human', `Needs a human (${code.replaceAll('_', ' ')}) · texting paused`);
        }
        await smsRepo.updateConv(q, id, { paused: true, pausedReason: `amber:${code}` });
      }
      await audit(q, actor, id, 'ecw.reenter', `${what} in eCW (import by ${actor.name}) — appointment ${ref?.booked?.day ?? ''} ${ref?.booked?.time ?? ''} removed, back to outreach`.replace(/ {2,}/g, ' '));
      break;
    }
    default:
      break;
  }
  if (ref && p.action !== 'none') ref.state = p.action.startsWith('reenter') ? 'In Progress' : 'Booked';
  return follow;
}

async function upsertEcwAppointment(q: Queryable, importId: string, p: PlannedRow, now: Date, tz: string): Promise<void> {
  if (!p.referralId || !p.apptKey || !p.row.date || p.row.startMin === null || p.row.category === 'unknown') return;
  const [y, m, d] = p.row.date.split('-').map(Number);
  const startAt = zonedTimeToUtc(y, m, d, Math.floor(p.row.startMin / 60), p.row.startMin % 60, tz);
  const s = slotOf(p.row);
  await q.query(
    `insert into ecw_appointments (appt_key, referral_id, start_at, day, time, duration_min, provider, facility, visit_type,
        status_raw, category, first_import_id, last_import_id, first_seen_at, last_seen_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$13)
     on conflict (appt_key) do update set referral_id = excluded.referral_id, start_at = excluded.start_at, day = excluded.day,
        time = excluded.time, duration_min = excluded.duration_min, provider = excluded.provider, facility = excluded.facility,
        visit_type = excluded.visit_type, status_raw = excluded.status_raw, category = excluded.category,
        last_import_id = excluded.last_import_id, last_seen_at = excluded.last_seen_at`,
    [p.apptKey, p.referralId, startAt, s.day, s.time, p.row.durationMin, p.row.provider, p.row.facility, p.row.visitType,
      p.row.statusRaw, p.row.category, importId, now]);
}

// ── Apply ───────────────────────────────────────────────────────────────────

export async function applyDraft(
  ctx: ImportCtx, actor: SessionUser, id: string, rawMapping: unknown, rawOptions: unknown, saveProfileName?: string | null,
): Promise<{ result: EcwApplyResult; followUps: FollowUp[] }> {
  const followUps: FollowUp[] = [];
  const result = await ctx.db.transaction(async tx => {
    const d = await loadDraft(tx, id, true);
    const headers = jsonOf<string[]>(d.headers, []);
    const raw = jsonOf<{ headerRow: number; rows: string[][] }>(d.raw_rows, { headerRow: 1, rows: [] });
    const mapping = sanitizeMapping(rawMapping ?? jsonOf(d.mapping, {}), headers);
    const options = sanitizeOptions(rawOptions ?? jsonOf(d.options, {}));
    const problems = mappingProblems(mapping);
    if (problems.length) throw new ImportError(400, problems.join(' '));

    const c = await compute(tx, ctx, headers, raw.rows, raw.headerRow, mapping, options);
    const refs = new Map(c.refs.map(r => [r.referralId, r]));
    const now = ctx.now();

    // Changes for each referral, in file order. planImport gives at most one change per referral.
    for (const p of c.plan) {
      const f = await executeRow(tx, ctx, actor, p, refs);
      if (f) followUps.push(f);
      if (p.action !== 'review' && p.action !== 'invalid') await upsertEcwAppointment(tx, id, p, now, ctx.tz);
    }

    // Review items (re-uploads don't duplicate items that are still open or that staff ignored).
    for (const p of c.plan.filter(x => x.action === 'review')) {
      if (p.apptKey) {
        const { rows } = await tx.query(
          `select 1 from ecw_import_review where appt_key = $1 and status in ('open', 'ignored') limit 1`, [p.apptKey]);
        if (rows.length) continue;
      }
      await tx.query(
        `insert into ecw_import_review (import_id, row_number, appt_key, reason, detail, row_data, candidates, created_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [id, p.row.rowNumber, p.apptKey, p.reviewReason ?? 'possible_match', p.detail, JSON.stringify(p.row),
          JSON.stringify(p.candidates ?? []), now]);
    }

    // Busy times (no patient identity) for the covered dates, so Relay never offers a time taken in eCW.
    if (c.rangeStart && c.rangeEnd) {
      await tx.query(`delete from ecw_busy_slots where local_date between $1::date and $2::date`, [c.rangeStart, c.rangeEnd]);
      const busyProviders = new Set((options.busyProviders ?? c.defaultBusyProviders).map(x => x.trim().toLowerCase()));
      const useAll = !mapping.provider;
      for (const p of c.plan) {
        const r = p.row;
        if (!r.date || r.startMin === null || !['scheduled', 'arrived', 'completed'].includes(r.category)) continue;
        if (!useAll && !(r.provider && busyProviders.has(r.provider.trim().toLowerCase()))) continue;
        await tx.query(
          `insert into ecw_busy_slots (import_id, local_date, start_min, duration_min, provider) values ($1, $2::date, $3, $4, $5)`,
          [id, r.date, r.startMin, r.durationMin ?? options.defaultDurationMin, r.provider]);
      }
    }

    let profileId = d.profile_id;
    if (saveProfileName?.trim()) {
      const name = saveProfileName.trim().slice(0, 80);
      const { rows } = await tx.query<{ id: string }>(
        `insert into ecw_import_profiles (name, mapping, options, headers, updated_at, updated_by, last_used_at)
         values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $5)
         on conflict (name) do update set mapping = excluded.mapping, options = excluded.options, headers = excluded.headers,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by, last_used_at = excluded.last_used_at
         returning id`,
        [name, JSON.stringify(mapping), JSON.stringify(options), JSON.stringify(headers), now, actor.name]);
      profileId = rows[0].id;
      await audit(tx, actor, null, 'ecw.profile', `eCW column mapping saved as "${name}"`);
    } else if (profileId) {
      await tx.query(`update ecw_import_profiles set last_used_at = $2 where id = $1`, [profileId, now]);
    }

    const counts = { ...c.counts };
    await tx.query(
      `update ecw_imports set status = 'applied', raw_rows = null, mapping = $2::jsonb, options = $3::jsonb, profile_id = $4,
          range_start = $5::date, range_end = $6::date, counts = $7::jsonb, applied_at = $8, applied_by_id = $9, applied_by_name = $10
        where id = $1`,
      [id, JSON.stringify(mapping), JSON.stringify(options), profileId, c.rangeStart, c.rangeEnd, JSON.stringify(counts), now, actor.id, actor.name]);
    await audit(tx, actor, null, 'ecw.apply',
      `eCW schedule import applied: ${counts.total} rows · ${counts.booked} booked · ${counts.updated} updated · ${counts.visits} visits · `
      + `${counts.reentered} back to outreach · ${counts.review} to review · ${counts.ignored} not in Relay`);
    const { rows: open } = await tx.query<{ n: number }>(`select count(*)::int as n from ecw_import_review where import_id = $1 and status = 'open'`, [id]);
    return { success: true, importId: id, counts, openReview: open[0].n } satisfies EcwApplyResult;
  });
  return { result, followUps };
}

// ── Review items ────────────────────────────────────────────────────────────

interface ReviewRow {
  id: string; import_id: string; row_number: number; reason: string; detail: string | null; row_data: unknown;
  candidates: unknown; status: EcwReviewItem['status']; outcome: string | null; resolved_by: string | null; resolved_at: Date | null;
  appt_key: string | null;
}

function reviewView(r: ReviewRow, refs: Map<string, RefInfo>, tz: string): EcwReviewItem {
  const row = jsonOf<NormRow>(r.row_data, {} as NormRow);
  return {
    id: r.id, importId: r.import_id, rowNumber: r.row_number, reason: r.reason, reasonLabel: REVIEW_LABEL[r.reason] ?? r.reason,
    detail: r.detail ?? '',
    row: rowView({ row, apptKey: r.appt_key, referralId: null, tier: null, action: 'review', detail: '' }),
    candidates: candidatesOf(jsonOf<string[]>(r.candidates, []), refs),
    status: r.status, outcome: r.outcome, resolvedBy: r.resolved_by, resolvedAt: fmtStamp(r.resolved_at, tz),
  };
}

export async function resolveReview(
  ctx: ImportCtx, actor: SessionUser, itemId: string, action: 'match' | 'ignore', referralId?: string,
): Promise<{ result: { success: boolean; outcome: string }; followUps: FollowUp[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new ImportError(400, 'Bad item id');
  const followUps: FollowUp[] = [];
  const result = await ctx.db.transaction(async tx => {
    const { rows } = await tx.query<ReviewRow>(`select * from ecw_import_review where id = $1 for update`, [itemId]);
    const item = rows[0];
    if (!item) throw new ImportError(404, 'Review item not found.');
    if (item.status !== 'open') throw new ImportError(409, 'This row was already handled.');
    const now = ctx.now();

    if (action === 'ignore') {
      await tx.query(`update ecw_import_review set status = 'ignored', resolved_by = $2, resolved_at = $3, outcome = 'Ignored' where id = $1`,
        [itemId, actor.name, now]);
      await audit(tx, actor, null, 'ecw.review.ignore', `eCW import row ${item.row_number} ignored by ${actor.name}`);
      return { success: true, outcome: 'Ignored' };
    }

    if (!referralId || !/^[A-Za-z0-9_-]{1,64}$/.test(referralId)) throw new ImportError(400, 'Pick a referral.');
    if (item.reason === 'unknown_status') {
      throw new ImportError(409, 'Relay does not know this eCW status. Fix the status in eCW and import again, or ignore the row.');
    }
    const refs = await loadRefInfos(tx);
    const ref = refs.find(r => r.referralId === referralId);
    if (!ref) throw new ImportError(404, 'Referral not found.');
    if (ref.state === 'Escalated') throw new ImportError(409, 'This referral is Escalated. Resolve the escalation first, then match the row.');
    const row = jsonOf<NormRow>(item.row_data, {} as NormRow);
    const [p] = planReferral(ref, [{ row, apptKey: item.appt_key, tier: 'linked' }], todayLocal(ctx));
    if (p.action === 'review' || p.action === 'invalid') throw new ImportError(409, p.detail);

    const refMap = new Map(refs.map(r => [r.referralId, r]));
    const f = await executeRow(tx, ctx, actor, p, refMap);
    if (f) followUps.push(f);
    await upsertEcwAppointment(tx, item.import_id, p, now, ctx.tz);
    const outcome = `${ACTION_LABEL[p.action]} — ${p.detail}`;
    await tx.query(
      `update ecw_import_review set status = 'matched', resolved_referral_id = $2, resolved_by = $3, resolved_at = $4, outcome = $5 where id = $1`,
      [itemId, referralId, actor.name, now, outcome]);
    await audit(tx, actor, referralId, 'ecw.review.match', `eCW import row matched to this referral by ${actor.name} (${ACTION_LABEL[p.action]})`);
    return { success: true, outcome };
  });
  return { result, followUps };
}

// ── History + status ────────────────────────────────────────────────────────

function summaryView(r: ImportRow, tz: string): EcwImportSummary {
  return {
    id: r.id, fileName: r.file_name, status: r.status,
    createdAt: fmtStamp(r.created_at, tz) ?? '', createdBy: r.created_by_name ?? 'Staff',
    appliedAt: fmtStamp(r.applied_at, tz), appliedBy: r.applied_by_name,
    rangeStart: fmtIsoDate(r.range_start), rangeEnd: fmtIsoDate(r.range_end),
    counts: r.counts ? jsonOf<EcwImportCounts>(r.counts, null as unknown as EcwImportCounts) : null,
    openReview: r.open_review ?? 0,
  };
}

export async function getStatus(ctx: ImportCtx): Promise<EcwImportStatus> {
  const q = ctx.db;
  const [{ rows }, open] = await Promise.all([
    q.query<{ applied_at: Date; applied_by_name: string | null }>(
      `select applied_at, applied_by_name from ecw_imports where status = 'applied' order by applied_at desc limit 1`),
    q.query<{ n: number }>(`select count(*)::int as n from ecw_import_review where status = 'open'`),
  ]);
  const staleHours = ctx.staleHours ?? 24;
  const f = importFreshness(rows[0]?.applied_at ?? null, ctx.now(), staleHours);
  return {
    lastAppliedAt: fmtStamp(rows[0]?.applied_at ?? null, ctx.tz), lastAppliedBy: rows[0]?.applied_by_name ?? null,
    stale: f.stale, never: f.never, hoursAgo: f.hoursAgo, staleHours, openReview: open.rows[0].n,
  };
}

export async function getOverview(ctx: ImportCtx): Promise<EcwImportOverview> {
  const q = ctx.db;
  await expireOldDrafts(q, ctx.now());
  const [imports, profiles, status] = await Promise.all([
    q.query<ImportRow>(
      `select ${IMPORT_COLS}, (select count(*)::int from ecw_import_review v where v.import_id = i.id and v.status = 'open') as open_review
         from ecw_imports i where i.status = 'applied' order by i.applied_at desc limit 50`),
    q.query<ProfileRow>(`select id, name, mapping, options, headers, updated_at, updated_by from ecw_import_profiles order by name`),
    getStatus(ctx),
  ]);
  return {
    imports: imports.rows.map(r => summaryView(r, ctx.tz)),
    status,
    profiles: profiles.rows.map(p => ({ id: p.id, name: p.name, updatedAt: fmtStamp(p.updated_at, ctx.tz) ?? '', updatedBy: p.updated_by })),
  };
}

export async function getImportDetail(ctx: ImportCtx, id: string): Promise<EcwImportDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const q = ctx.db;
  const { rows } = await q.query<ImportRow>(
    `select ${IMPORT_COLS}, (select count(*)::int from ecw_import_review v where v.import_id = i.id and v.status = 'open') as open_review
       from ecw_imports i where i.id = $1`, [id]);
  if (!rows[0]) return null;
  const [review, refs] = await Promise.all([
    q.query<ReviewRow>(`select * from ecw_import_review where import_id = $1 order by status = 'open' desc, row_number`, [id]),
    loadRefInfos(q),
  ]);
  const refMap = new Map(refs.map(r => [r.referralId, r]));
  return { summary: summaryView(rows[0], ctx.tz), review: review.rows.map(r => reviewView(r, refMap, ctx.tz)) };
}

/**
 * Every slot-grid time that must not be offered (Relay captured/confirmed + eCW busy times) —
 * the same list the SMS agent uses; the voice flow reads it via src/lib/data.ts getBookedSlotKeys.
 */
export async function listTakenSlots(ctx: ImportCtx): Promise<{ day: string; time: string }[]> {
  return smsRepo.takenSlots(ctx.db);
}
