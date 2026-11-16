// FHIR (Epic sandbox) → Relay mapping. Pure functions, unit-tested with recorded shapes.

import type { EhrAppointment, EhrPatient, EhrSlot } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

/** Epic's MRN identifier system in the sandbox (type text "MRN"). */
export const EPIC_SANDBOX_MRN_SYSTEM = 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14';
export const EPIC_SANDBOX_VISIT_TYPE_SYSTEM = 'urn:oid:1.2.840.114350.1.13.0.1.7.3.808267.11';

const LANG_BY_TEXT: Record<string, string> = { english: 'en', spanish: 'es', 'español': 'es', espanol: 'es' };

function languageOf(p: Json): string | null {
  const comms: Json[] = Array.isArray(p.communication) ? p.communication : [];
  const pick = comms.find(c => c?.preferred === true || c?.preferred === 'true') ?? comms[0];
  if (!pick) return null;
  const code: string | undefined = pick.language?.coding?.find((c: Json) => typeof c?.code === 'string')?.code;
  if (code) return code.toLowerCase().split('-')[0];
  const text: string | undefined = pick.language?.text;
  return text ? (LANG_BY_TEXT[text.trim().toLowerCase()] ?? null) : null;
}

function bestPhone(p: Json): { phone: string | null; use: string | null } {
  const phones: Json[] = (Array.isArray(p.telecom) ? p.telecom : []).filter((t: Json) => t?.system === 'phone' && t?.value);
  const rank = (u?: string) => (u === 'mobile' ? 0 : u === 'home' ? 1 : u === 'work' ? 3 : 2);
  const sorted = [...phones].sort((a, b) => rank(a.use) - rank(b.use));
  return sorted[0] ? { phone: String(sorted[0].value), use: sorted[0].use ?? null } : { phone: null, use: null };
}

export function mapPatient(p: Json): EhrPatient {
  const names: Json[] = Array.isArray(p.name) ? p.name : [];
  const n = names.find(x => x?.use === 'official') ?? names.find(x => x?.use === 'usual') ?? names[0] ?? {};
  const identifiers = (Array.isArray(p.identifier) ? p.identifier : [])
    .filter((i: Json) => typeof i?.system === 'string' && typeof i?.value === 'string')
    .map((i: Json) => ({ system: i.system as string, value: i.value as string }));
  const mrnId = (Array.isArray(p.identifier) ? p.identifier : []).find(
    (i: Json) => i?.system === EPIC_SANDBOX_MRN_SYSTEM || /^MRN$/i.test(i?.type?.text ?? ''));
  const { phone, use } = bestPhone(p);
  const gender = typeof p.gender === 'string' ? p.gender : null;
  return {
    id: String(p.id),
    mrn: mrnId?.value ?? null,
    firstName: Array.isArray(n.given) ? n.given.join(' ') : (n.given ?? ''),
    lastName: n.family ?? '',
    birthDate: typeof p.birthDate === 'string' ? p.birthDate : null,
    sex: gender === 'male' || gender === 'female' || gender === 'other' || gender === 'unknown' ? gender : null,
    phone,
    phoneUse: use,
    language: languageOf(p),
    identifiers,
  };
}

function participants(a: Json): { provider: string | null; department: string | null } {
  const parts: Json[] = Array.isArray(a.participant) ? a.participant : [];
  const ref = (kind: string) => parts.find(x => typeof x?.actor?.reference === 'string' && x.actor.reference.includes(`/${kind}/`))?.actor?.display ?? null;
  return { provider: ref('Practitioner'), department: ref('Location') };
}

function visitTypeOf(a: Json): string | null {
  const st = Array.isArray(a.serviceType) ? a.serviceType[0] : a.serviceType;
  return st?.text ?? st?.coding?.[0]?.display ?? a.appointmentType?.text ?? null;
}

export function mapAppointment(a: Json): EhrAppointment {
  const { provider, department } = participants(a);
  return {
    id: String(a.id),
    start: a.start,
    end: a.end ?? null,
    status: a.status ?? 'unknown',
    visitType: visitTypeOf(a),
    provider,
    department,
    note: a.comment ?? null,
  };
}

export function mapSlot(a: Json): EhrSlot {
  const { provider, department } = participants(a);
  return { ref: String(a.id), start: a.start, end: a.end ?? null, visitType: visitTypeOf(a), provider, department };
}

/** Resources of a type from a Bundle (or the resource itself). */
export function resourcesOf(body: Json, type: string): Json[] {
  if (!body) return [];
  if (body.resourceType === type) return [body];
  return (Array.isArray(body.entry) ? body.entry : []).map((e: Json) => e?.resource).filter((r: Json) => r?.resourceType === type);
}

/** Human-readable text from any OperationOutcome(s) in a response. */
export function outcomeText(body: Json): string {
  return resourcesOf(body, 'OperationOutcome')
    .flatMap((o: Json) => (o.issue ?? []).map((i: Json) => i?.diagnostics ?? i?.details?.text ?? i?.code))
    .filter(Boolean).join('; ');
}

/** Builds the STU3 Patient passed to $find (identifiers + demographics; no clinical data). */
export function findPatientResource(p: EhrPatient): Json {
  return {
    resourceType: 'Patient',
    identifier: p.identifiers
      .filter(i => i.system === EPIC_SANDBOX_MRN_SYSTEM)
      .map(i => ({ use: 'usual', type: { text: 'MRN' }, system: i.system, value: i.value })),
    name: [{ use: 'usual', family: p.lastName, given: p.firstName ? p.firstName.split(' ') : [] }],
    ...(p.sex ? { gender: p.sex } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate } : {}),
  };
}
