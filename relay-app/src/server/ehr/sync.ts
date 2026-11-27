// "Sync from Epic" (Phase 2, docs/EPIC_PROTOTYPE_PLAN.md): a SIMULATED referral feed. Epic has no
// referral-search API, so an admin lists Epic sandbox patient FHIR IDs in Settings and this imports
// each one as a Relay referral. Manual button only: nothing calls this on a timer.
//
// Each patient is read from the EHR connector, upserted as a Relay patient linked by
// patients.epic_patient_id, and gets ONE new referral unless it already has an open one.
// New referrals go through the same creation path as spreadsheet/manual ingest
// (insertNewReferral), so they start Queued and wait in "Ready to text" when pilot mode is on.
// This never sends a text: the outreach scheduler does that under its own rules.

import 'server-only';
import { getDb, type Queryable } from '../db';
import { logError } from '../log';
import {
  insertNewReferral, nextReferralNumber, resetTextIdentity, sanitizeIngestRow, type Actor,
} from '../referrals';
import { getEhrConnector, getEpicSettings, recordEpicSync, type EpicFeedPatient } from './index';
import { EhrError, type EhrPatient } from './types';
import type { EpicSyncResult } from '@/lib/types';

/** Referral source / referring text on referrals created by this sync. */
export const EPIC_SOURCE = 'Epic sandbox';

/**
 * The only closed state is Booked (REFERRAL_STATUSES.md): Queued, In Progress, Attempted,
 * Pending Confirmation and Escalated all still need work, so a patient in any of them is
 * "already in Relay" and gets no second referral.
 */
const CLOSED_STATES = ['Booked'];

export class EpicSyncError extends Error {
  constructor(message: string) { super(message); this.name = 'EpicSyncError'; }
}

/** The app's phone format: +1XXXXXXXXXX for US numbers, otherwise as given. */
export function normalizeEpicPhone(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return v;
}

/** Relay stores language names ("English", "Spanish"). Other languages keep their name so outreach flags them for staff. */
export function epicLanguage(code: string | null): string {
  const c = (code ?? '').trim().toLowerCase();
  if (!c || c.startsWith('en')) return 'English';
  if (c.startsWith('es')) return 'Spanish';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(c) ?? c;
  } catch {
    return c;
  }
}

const sexOf = (s: EhrPatient['sex']) => (s === 'female' ? 'F' : s === 'male' ? 'M' : null);
const isoToMdy = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : undefined);

interface PatientRow {
  id: string; name: string; dob: string | null; sex: string | null; phone: string | null; language: string; mrn: string | null;
}

type Item = EpicSyncResult['items'][number];

async function syncOne(q: Queryable, feed: EpicFeedPatient, ehr: EhrPatient, actor: Actor): Promise<Item> {
  const name = `${ehr.firstName} ${ehr.lastName}`.trim() || 'Unknown patient';
  const dob = ehr.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(ehr.birthDate) ? ehr.birthDate : null;
  const phone = normalizeEpicPhone(ehr.phone);
  const language = epicLanguage(ehr.language);
  const sex = sexOf(ehr.sex);

  // Lock the linked patient (if any) so two overlapping syncs can't both create a referral.
  const { rows: existing } = await q.query<PatientRow>(
    `select id, name, to_char(date_of_birth, 'YYYY-MM-DD') as dob, sex, phone, language, mrn
       from patients where epic_patient_id = $1 for update`, [feed.fhirId]);

  let patientId: string;
  let detailsUpdated = false;
  if (existing[0]) {
    const before = existing[0];
    patientId = before.id;
    // The phone stays as staff set it (the demo owner edits it to their own phone, plan rule 7);
    // Epic's number only fills a missing one.
    const next = {
      name, dob: dob ?? before.dob, sex: sex ?? before.sex, phone: before.phone || phone,
      language, mrn: ehr.mrn ?? before.mrn,
    };
    detailsUpdated = next.name !== before.name || next.dob !== before.dob || next.sex !== before.sex
      || next.phone !== before.phone || next.language !== before.language || next.mrn !== before.mrn;
    if (detailsUpdated) {
      await q.query(
        `update patients set name = $2, date_of_birth = $3::date, sex = $4, phone = $5, language = $6, mrn = $7 where id = $1`,
        [patientId, next.name, next.dob, next.sex, next.phone, next.language, next.mrn]);
      if (before.dob && next.dob !== before.dob) await resetTextIdentity(q, patientId, 'Date of birth', actor);
    }
  } else {
    if (!phone) throw new EpicSyncError('Epic has no phone number for this patient, so Relay cannot text them. Not imported.');
    const { rows } = await q.query<{ id: string }>(
      `insert into patients (name, date_of_birth, sex, phone, language, insurance, mrn, epic_patient_id)
       values ($1, $2::date, $3, $4, $5, '', $6, $7) returning id`,
      [name, dob, sex, phone, language, ehr.mrn, feed.fhirId]);
    patientId = rows[0].id;
  }

  const { rows: open } = await q.query<{ id: string }>(
    `select id from referrals where patient_id = $1 and state <> all($2::text[]) order by referral_time desc limit 1`,
    [patientId, CLOSED_STATES]);
  if (open[0]) {
    if (detailsUpdated) {
      await q.query(
        `insert into audit_log (referral_id, actor_id, actor_name, actor_role, action, what) values ($1, $2, $3, $4, $5, $6)`,
        [open[0].id, actor.id, actor.name, actor.role, 'epic.sync_update', 'Patient details refreshed from Epic sandbox (Sync from Epic)']);
    }
    return { fhirId: feed.fhirId, outcome: 'already_open', patient: name, referralId: open[0].id, detailsUpdated };
  }

  const row = sanitizeIngestRow({
    patientName: name, phone: phone ?? '', dateOfBirth: isoToMdy(dob), language,
    reason: feed.specialty ? `${feed.specialty} referral (Epic sandbox)` : 'Referral from Epic sandbox',
    specialty: feed.specialty ?? undefined, referringProvider: EPIC_SOURCE,
  });
  const referralId = await insertNewReferral(q, {
    id: `REF-${await nextReferralNumber(q)}`, patientId, row, source: EPIC_SOURCE,
    auditWhat: `Imported from Epic sandbox (Sync from Epic) · Epic patient ${feed.fhirId} · visit type ${feed.visitType}`,
  }, actor);
  return { fhirId: feed.fhirId, outcome: 'imported', patient: name, referralId, detailsUpdated };
}

const chain = globalThis as unknown as { __relayEpicSync?: Promise<unknown> };

/**
 * Imports every patient in the Epic feed setting. One patient's failure (EhrError or otherwise)
 * is recorded in `errors` and never stops the rest. Runs are serialized in this server process.
 */
export async function syncFromEpic(actor: Actor): Promise<EpicSyncResult> {
  const run = () => runSync(actor);
  const next = (chain.__relayEpicSync ?? Promise.resolve()).catch(() => undefined).then(run);
  chain.__relayEpicSync = next.catch(() => undefined);
  return next;
}

async function runSync(actor: Actor): Promise<EpicSyncResult> {
  const db = await getDb();
  const settings = await getEpicSettings(db);
  if (settings.patients.length === 0) {
    throw new EpicSyncError('Add at least one Epic patient FHIR ID and save before syncing.');
  }
  const ehr = getEhrConnector();
  const items: Item[] = [];
  const errors: EpicSyncResult['errors'] = [];

  for (const feed of settings.patients) {
    try {
      const patient = await ehr.getPatient(feed.fhirId);
      items.push(await db.transaction(tx => syncOne(tx, feed, patient, actor)));
    } catch (err) {
      let message: string;
      if (err instanceof EhrError || err instanceof EpicSyncError) message = err.message;
      else {
        logError(`epic sync (${feed.fhirId})`, err);
        message = 'Could not import this patient (server error).';
      }
      errors.push({ fhirId: feed.fhirId, error: message });
      items.push({ fhirId: feed.fhirId, outcome: 'error', patient: null, referralId: null, detailsUpdated: false });
    }
  }

  const result: EpicSyncResult = {
    imported: items.filter(i => i.outcome === 'imported').length,
    updated: items.filter(i => i.detailsUpdated).length,
    alreadyOpen: items.filter(i => i.outcome === 'already_open').length,
    errors,
    connector: ehr.kind,
    at: new Date().toISOString(),
    items,
  };
  await recordEpicSync(result, db);
  await db.query(
    `insert into audit_log (referral_id, actor_id, actor_name, actor_role, action, what) values (null, $1, $2, $3, 'epic.sync', $4)`,
    [actor.id, actor.name, actor.role,
      `Sync from Epic (${ehr.kind}): ${result.imported} imported, ${result.alreadyOpen} already in Relay, ${errors.length} errors`]);
  return result;
}
