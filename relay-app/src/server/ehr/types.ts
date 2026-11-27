// EHR connector contract (docs/EPIC_PROTOTYPE_PLAN.md). Plain Relay-shaped data: no FHIR leaves
// src/server/ehr/. Implementations: Epic sandbox (./epic) and an in-memory fake (./fake) for tests.
//
// Native booking is a SANDBOX PROTOTYPE ONLY and always follows an MA's Confirm — nothing here
// books on its own.

export interface EhrPatient {
  /** EHR's patient ID (Epic: Patient FHIR ID). */
  id: string;
  mrn: string | null;
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  birthDate: string | null;
  sex: 'male' | 'female' | 'other' | 'unknown' | null;
  /** Best number to text: mobile first, then home, then any phone. E.164-ish as given by the EHR. */
  phone: string | null;
  phoneUse: string | null;
  /** 'en' | 'es' | other ISO code, or null when unknown. */
  language: string | null;
  /** EHR identifiers (system + value), passed back to the EHR when finding slots. */
  identifiers: { system: string; value: string }[];
}

export interface EhrAppointment {
  id: string;
  /** ISO instant */
  start: string;
  end: string | null;
  status: string;
  visitType: string | null;
  provider: string | null;
  department: string | null;
  note: string | null;
}

/** An open time proposed by the EHR for one patient (Epic $find). Held only briefly by the EHR. */
export interface EhrSlot {
  /** Opaque reference needed to book this exact slot (Epic: the proposed Appointment id). */
  ref: string;
  start: string;
  end: string | null;
  visitType: string | null;
  provider: string | null;
  department: string | null;
}

export interface FindSlotsInput {
  patient: EhrPatient;
  /** ISO instants */
  from: string;
  to: string;
  /** EHR visit-type code (Epic sandbox: '95014'). */
  visitType: string;
}

export interface BookSlotInput {
  patientId: string;
  slotRef: string;
  note: string;
}

export interface EhrConnector {
  /** 'epic-sandbox' | 'fake' */
  readonly kind: string;
  getPatient(id: string): Promise<EhrPatient>;
  searchAppointments(patientId: string, opts?: { from?: string }): Promise<EhrAppointment[]>;
  findSlots(input: FindSlotsInput): Promise<EhrSlot[]>;
  bookSlot(input: BookSlotInput): Promise<EhrAppointment>;
  /** Cheap connectivity check (gets a token). */
  ping(): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Thrown for any EHR failure. `code` lets callers react (e.g. slot no longer available). */
export class EhrError extends Error {
  constructor(
    message: string,
    readonly code: 'config' | 'auth' | 'not_found' | 'slot_unavailable' | 'bad_request' | 'upstream' | 'network',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EhrError';
  }
}
