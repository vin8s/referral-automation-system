// eCW schedule import: the column fields staff can map, their labels, and the
// header auto-guess. Pure constants + functions (no data), shared by the import
// screen and the server (src/server/import/).

export type EcwField =
  | 'patientName' | 'lastName' | 'firstName' | 'dob' | 'mrn' | 'phone'
  | 'apptDate' | 'apptTime' | 'duration' | 'provider' | 'facility' | 'visitType' | 'status' | 'apptId';

export type EcwMapping = Partial<Record<EcwField, string | null>>;

export interface EcwImportOptions {
  /** Order of numeric dates like 03/04/1980. eCW (US) exports month first. */
  dateOrder: 'MDY' | 'DMY';
  /** How the patient name column is written. 'auto' = "Last, First" when there is a comma, else "First Last". */
  nameOrder: 'auto' | 'last_first' | 'first_last';
  /** Appointment length used when the report has no duration column. */
  defaultDurationMin: number;
  /**
   * Providers/resources whose eCW appointments block the times Relay offers patients.
   * null = providers seen on rows that matched a referral (the referral specialists).
   */
  busyProviders: string[] | null;
}

export const DEFAULT_IMPORT_OPTIONS: EcwImportOptions = {
  dateOrder: 'MDY',
  nameOrder: 'auto',
  defaultDurationMin: 30,
  busyProviders: null,
};

export interface EcwFieldDef {
  field: EcwField;
  label: string;
  hint: string;
  /** Header spellings seen in eCW appointment reports (normalized: lowercase, words only). */
  aliases: string[];
}

export const ECW_FIELDS: EcwFieldDef[] = [
  { field: 'patientName', label: 'Patient name', hint: '"Last, First" or "First Last"',
    aliases: ['patient name', 'patient', 'name', 'pt name', 'patient full name', 'last first', 'last name first name', 'patient last first'] },
  { field: 'lastName', label: 'Last name', hint: 'Only if first and last are separate columns',
    aliases: ['last name', 'patient last name', 'lname', 'last', 'pt last name', 'surname'] },
  { field: 'firstName', label: 'First name', hint: 'Only if first and last are separate columns',
    aliases: ['first name', 'patient first name', 'fname', 'first', 'pt first name', 'given name'] },
  { field: 'dob', label: 'Date of birth', hint: 'MM/DD/YYYY',
    aliases: ['dob', 'date of birth', 'birth date', 'birthdate', 'patient dob', 'pt dob', 'birthday'] },
  { field: 'mrn', label: 'MRN / Account No', hint: 'Matched exactly first',
    aliases: ['mrn', 'account no', 'account number', 'acct no', 'acct', 'account', 'patient account', 'patient account no',
      'patient acct no', 'chart no', 'chart number', 'patient id', 'medical record number', 'medical record no', 'med rec no',
      'patient no', 'patient number', 'pt acct no', 'acc no'] },
  { field: 'phone', label: 'Phone', hint: 'Used only with date of birth',
    aliases: ['phone', 'home phone', 'cell phone', 'cell', 'mobile', 'mobile phone', 'phone number', 'patient phone', 'contact phone',
      'primary phone', 'tel', 'telephone', 'phone no'] },
  { field: 'apptDate', label: 'Appointment date', hint: 'May also contain the time',
    aliases: ['appointment date', 'appt date', 'apt date', 'date', 'visit date', 'start date', 'appointment date time',
      'appt date time', 'date of service', 'dos', 'service date', 'scheduled date'] },
  { field: 'apptTime', label: 'Start time', hint: '10:30 AM or 14:30',
    aliases: ['appointment time', 'appt time', 'apt time', 'time', 'start time', 'visit time', 'start', 'appt start time', 'scheduled time'] },
  { field: 'duration', label: 'Duration (min)', hint: 'Optional',
    aliases: ['duration', 'length', 'appt length', 'minutes', 'duration min', 'duration mins', 'appt duration', 'visit length', 'mins'] },
  { field: 'provider', label: 'Provider / resource', hint: 'Optional',
    aliases: ['provider', 'resource', 'appointment provider', 'appt provider', 'rendering provider', 'provider name', 'resource name',
      'doctor', 'physician', 'scheduled provider', 'resource provider'] },
  { field: 'facility', label: 'Facility / location', hint: 'Optional',
    aliases: ['facility', 'location', 'site', 'office', 'facility name', 'pos', 'appt facility', 'service location'] },
  { field: 'visitType', label: 'Visit type', hint: 'Optional',
    aliases: ['visit type', 'appointment type', 'appt type', 'apt type', 'type', 'visit code', 'type of visit'] },
  { field: 'status', label: 'Status', hint: 'Scheduled, Cancelled, No Show, Arrived…',
    aliases: ['status', 'visit status', 'appointment status', 'appt status', 'apt status', 'encounter status'] },
  { field: 'apptId', label: 'Appointment ID', hint: 'Optional, makes re-imports exact',
    aliases: ['appointment id', 'appt id', 'apt id', 'encounter id', 'enc id', 'visit id', 'encounter no', 'encounter number',
      'appointment no', 'appointment number', 'enc no'] },
];

export const ECW_FIELD_LABELS: Record<EcwField, string> =
  Object.fromEntries(ECW_FIELDS.map(f => [f.field, f.label])) as Record<EcwField, string>;

/** "Account No." → "account no", "Acct #" → "acct no", "DOB:" → "dob". */
export function normalizeHeader(h: string): string {
  return h
    .replace(/#/g, ' no ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Guesses which header holds each field. Exact alias matches win; then a header
 * that contains an alias as whole words. Each header is used at most once.
 */
export function guessMapping(headers: string[]): EcwMapping {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: EcwMapping = {};
  const take = (field: EcwField, idx: number) => { mapping[field] = headers[idx]; used.add(idx); };

  // Pass 1: exact alias match (fields in ECW_FIELDS order, aliases in priority order).
  for (const def of ECW_FIELDS) {
    for (const alias of def.aliases) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h === alias);
      if (idx >= 0) { take(def.field, idx); break; }
    }
  }
  // Pass 2: header contains a multi-word alias ("Appointment Date (MM/DD/YYYY)").
  for (const def of ECW_FIELDS) {
    if (mapping[def.field]) continue;
    for (const alias of def.aliases) {
      if (alias.length < 4) continue;
      const re = new RegExp(`(^| )${alias}( |$)`);
      const idx = norm.findIndex((h, i) => !used.has(i) && re.test(h));
      if (idx >= 0) { take(def.field, idx); break; }
    }
  }
  // A full-name column makes separate first/last guesses unnecessary, and vice versa.
  if (mapping.patientName && mapping.lastName && mapping.firstName) delete mapping.patientName;
  return mapping;
}

/** Fields that must be mapped before a preview can run. */
export function mappingProblems(m: EcwMapping): string[] {
  const out: string[] = [];
  if (!m.apptDate) out.push('Map the appointment date column.');
  if (!m.patientName && !(m.lastName && m.firstName) && !m.mrn) out.push('Map an MRN / Account No column or the patient name.');
  if (!m.mrn && !m.dob) out.push('Map the date of birth (needed to match patients without an MRN).');
  return out;
}

/** True when the last applied import is older than `staleHours` (or there has never been one). */
export function importFreshness(lastAppliedAt: Date | string | null, now: Date, staleHours = 24):
  { stale: boolean; never: boolean; hoursAgo: number | null } {
  if (!lastAppliedAt) return { stale: true, never: true, hoursAgo: null };
  const hours = (now.getTime() - new Date(lastAppliedAt).getTime()) / 3600_000;
  return { stale: hours > staleHours, never: false, hoursAgo: Math.max(0, Math.floor(hours)) };
}
