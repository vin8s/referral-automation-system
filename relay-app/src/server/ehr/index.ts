// EHR entry point: which connector to use, and the Epic prototype settings (docs/EPIC_PROTOTYPE_PLAN.md).
// Epic sandbox when EPIC_CLIENT_ID is set, otherwise the in-memory fake (tests, agents, no credentials).

import 'server-only';
import { getDb } from '../db';
import type { Queryable } from '../db';
import { EpicSandboxConnector } from './epic/connector';
import { isEpicConfigured, loadEpicConfig } from './epic/config';
import { FakeEhrConnector } from './fake';
import type { EhrConnector } from './types';

export type { EhrConnector, EhrPatient, EhrAppointment, EhrSlot } from './types';
export { EhrError } from './types';

let connector: EhrConnector | null = null;

export function getEhrConnector(): EhrConnector {
  connector ??= isEpicConfigured() ? new EpicSandboxConnector(loadEpicConfig()) : new FakeEhrConnector();
  return connector;
}

/** Tests: inject a connector (or reset to the default with null). */
export function setEhrConnectorForTests(c: EhrConnector | null): void {
  connector = c;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface EpicFeedPatient {
  /** Epic sandbox Patient FHIR ID */
  fhirId: string;
  /** Epic visit-type code used for $find (sandbox: '95014') */
  visitType: string;
  /** Shown on the referral (e.g. "Family Medicine") */
  specialty: string | null;
}

export interface EpicSettings {
  /** "Book into Epic (sandbox)": MA's Confirm books in Epic. Off by default. */
  bookingEnabled: boolean;
  /** Simulated referral feed imported by "Sync from Epic". */
  patients: EpicFeedPatient[];
  lastSyncAt: string | null;
  lastSyncResult: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface EpicSettingsView {
  settings: EpicSettings;
  /** 'epic-sandbox' when credentials are configured, otherwise 'fake'. */
  connector: string;
}

export const DEFAULT_EPIC_VISIT_TYPE = '95014';

function toIso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function getEpicSettings(q?: Queryable): Promise<EpicSettings> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<Record<string, unknown>>(`select * from epic_settings where id = 'default'`);
  const r = rows[0] ?? {};
  const raw = Array.isArray(r.patients) ? r.patients : [];
  return {
    bookingEnabled: r.booking_enabled === true,
    patients: raw
      .filter((p: Record<string, unknown>) => typeof p?.fhirId === 'string' && p.fhirId)
      .map((p: Record<string, unknown>) => ({
        fhirId: String(p.fhirId),
        visitType: typeof p.visitType === 'string' && p.visitType ? p.visitType : DEFAULT_EPIC_VISIT_TYPE,
        specialty: typeof p.specialty === 'string' && p.specialty ? p.specialty : null,
      })),
    lastSyncAt: toIso(r.last_sync_at),
    lastSyncResult: r.last_sync_result ?? null,
    updatedAt: toIso(r.updated_at),
    updatedBy: (r.updated_by as string) ?? null,
  };
}

export async function getEpicSettingsView(): Promise<EpicSettingsView> {
  return { settings: await getEpicSettings(), connector: getEhrConnector().kind };
}

const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;

/** Validates and saves the admin-editable part (booking toggle + patient list). */
export async function saveEpicSettings(
  input: { bookingEnabled: boolean; patients: EpicFeedPatient[] },
  actorName: string,
): Promise<EpicSettings> {
  if (typeof input.bookingEnabled !== 'boolean') throw new Error('bookingEnabled must be true or false.');
  if (!Array.isArray(input.patients) || input.patients.length > 50) throw new Error('Provide up to 50 Epic patients.');
  const seen = new Set<string>();
  const patients = input.patients.map(p => {
    const fhirId = String(p?.fhirId ?? '').trim();
    if (!FHIR_ID.test(fhirId)) throw new Error(`"${fhirId}" is not a valid Epic patient FHIR ID.`);
    if (seen.has(fhirId)) throw new Error(`Patient ${fhirId} is listed twice.`);
    seen.add(fhirId);
    const visitType = String(p?.visitType ?? DEFAULT_EPIC_VISIT_TYPE).trim() || DEFAULT_EPIC_VISIT_TYPE;
    if (!/^[A-Za-z0-9\-.]{1,32}$/.test(visitType)) throw new Error(`"${visitType}" is not a valid visit-type code.`);
    const specialty = p?.specialty ? String(p.specialty).trim().slice(0, 80) : null;
    return { fhirId, visitType, specialty };
  });
  const db = await getDb();
  await db.query(
    `update epic_settings set booking_enabled = $1, patients = $2::jsonb, updated_at = now(), updated_by = $3 where id = 'default'`,
    [input.bookingEnabled, JSON.stringify(patients), actorName]);
  return getEpicSettings(db);
}

export async function recordEpicSync(result: unknown, q?: Queryable): Promise<void> {
  const db = q ?? (await getDb());
  await db.query(`update epic_settings set last_sync_at = now(), last_sync_result = $1::jsonb where id = 'default'`, [JSON.stringify(result)]);
}
