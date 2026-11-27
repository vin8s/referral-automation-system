// Epic FHIR SANDBOX connector (docs/EPIC_PROTOTYPE_PLAN.md). Read patients/appointments, $find open
// slots, $book a slot. Booking is only ever called after an MA's Confirm (src/server/referrals.ts).

import type { BookSlotInput, EhrAppointment, EhrConnector, EhrPatient, EhrSlot, FindSlotsInput } from '../types';
import { EhrError } from '../types';
import { EpicTokenSource } from './auth';
import type { EpicConfig } from './config';
import {
  EPIC_SANDBOX_VISIT_TYPE_SYSTEM, findPatientResource, mapAppointment, mapPatient, mapSlot, outcomeText, resourcesOf,
} from './fhir';

type Fetch = typeof fetch;
/* eslint-disable @typescript-eslint/no-explicit-any */

export class EpicSandboxConnector implements EhrConnector {
  readonly kind = 'epic-sandbox';
  private readonly tokens: EpicTokenSource;

  constructor(private readonly cfg: EpicConfig, private readonly fetchImpl: Fetch = fetch) {
    this.tokens = new EpicTokenSource(cfg, fetchImpl);
  }

  private async call(url: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<{ status: number; body: any }> {
    const token = await this.tokens.get();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/fhir+json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/fhir+json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new EhrError(`Could not reach Epic: ${err instanceof Error ? err.message : String(err)}`, 'network');
    }
    if (res.status === 401 && !retried) {
      this.tokens.invalidate();
      return this.call(url, init, true);
    }
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  private fail(what: string, status: number, body: any): never {
    const detail = outcomeText(body);
    const msg = `${what} failed (HTTP ${status})${detail ? `: ${detail}` : ''}.`;
    if (status === 401 || status === 403) {
      throw new EhrError(`${msg} Newly added APIs can take up to 30 minutes to sync to the Epic sandbox.`, 'auth', status);
    }
    if (status === 404) throw new EhrError(msg, 'not_found', status);
    if (status >= 500) throw new EhrError(msg, 'upstream', status);
    throw new EhrError(msg, 'bad_request', status);
  }

  async getPatient(id: string): Promise<EhrPatient> {
    const { status, body } = await this.call(`${this.cfg.r4Base}/Patient/${encodeURIComponent(id)}`);
    if (status !== 200 || body?.resourceType !== 'Patient') this.fail(`Reading Epic patient ${id}`, status, body);
    return mapPatient(body);
  }

  async searchAppointments(patientId: string, opts: { from?: string } = {}): Promise<EhrAppointment[]> {
    const q = new URLSearchParams({ patient: patientId, 'service-category': 'appointment' });
    if (opts.from) q.set('date', `ge${opts.from.slice(0, 10)}`);
    const { status, body } = await this.call(`${this.cfg.r4Base}/Appointment?${q}`);
    if (status !== 200) this.fail('Searching Epic appointments', status, body);
    return resourcesOf(body, 'Appointment').map(mapAppointment);
  }

  async findSlots(input: FindSlotsInput): Promise<EhrSlot[]> {
    const params = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'patient', resource: findPatientResource(input.patient) },
        { name: 'startTime', valueDateTime: input.from },
        { name: 'endTime', valueDateTime: input.to },
        // Epic's docs say "serviceType"; the sandbox only accepts "service-type".
        { name: 'service-type', valueCodeableConcept: { coding: [{ system: EPIC_SANDBOX_VISIT_TYPE_SYSTEM, code: input.visitType }] } },
      ],
    };
    const { status, body } = await this.call(`${this.cfg.stu3Base}/Appointment/$find`, { method: 'POST', body: params });
    if (status !== 200) this.fail('Finding open Epic slots ($find)', status, body);
    return resourcesOf(body, 'Appointment').map(mapSlot);
  }

  async bookSlot(input: BookSlotInput): Promise<EhrAppointment> {
    const params = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'patient', valueIdentifier: { value: input.patientId } },
        { name: 'appointment', valueIdentifier: { value: input.slotRef } },
        { name: 'appointmentNote', valueString: input.note.slice(0, 500) },
      ],
    };
    const { status, body } = await this.call(`${this.cfg.stu3Base}/Appointment/$book`, { method: 'POST', body: params });
    const appt = resourcesOf(body, 'Appointment')[0];
    if (status === 200 && appt) return mapAppointment(appt);
    if (status === 400 || status === 404 || status === 409 || status === 422 || (status === 200 && !appt)) {
      // $find holds slots only briefly; a stale or taken slot is the common failure.
      const detail = outcomeText(body);
      throw new EhrError(`Epic could not book that slot${detail ? `: ${detail}` : ''}. It may no longer be available.`, 'slot_unavailable', status);
    }
    this.fail('Booking in Epic ($book)', status, body);
  }

  async ping(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.tokens.get();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
