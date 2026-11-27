// In-memory EHR connector: used by tests and when EPIC_CLIENT_ID is not set (so the app and agents can
// work without Epic credentials). Synthetic patients only. Behaves like the Epic sandbox: slots are
// proposed by findSlots, bookSlot only accepts a currently-proposed, unbooked slot.

import type { BookSlotInput, EhrAppointment, EhrConnector, EhrPatient, EhrSlot, FindSlotsInput } from './types';
import { EhrError } from './types';

export const FAKE_EHR_PATIENTS: EhrPatient[] = [
  {
    id: 'fake-camila', mrn: 'F203713', firstName: 'Camila Maria', lastName: 'Lopez', birthDate: '1987-09-12',
    sex: 'female', phone: '469-555-5555', phoneUse: 'mobile', language: 'en',
    identifiers: [{ system: 'urn:fake:mrn', value: 'F203713' }],
  },
  {
    id: 'fake-derrick', mrn: 'F203711', firstName: 'Derrick', lastName: 'Lin', birthDate: '1973-06-03',
    sex: 'male', phone: '785-555-5555', phoneUse: 'mobile', language: 'en',
    identifiers: [{ system: 'urn:fake:mrn', value: 'F203711' }],
  },
];

export class FakeEhrConnector implements EhrConnector {
  readonly kind = 'fake';
  readonly booked: (EhrAppointment & { patientId: string })[] = [];
  private proposed = new Map<string, EhrSlot>();
  /** Test hook: refs listed here fail to book as if someone else took them. */
  readonly takenRefs = new Set<string>();

  constructor(private readonly patients: EhrPatient[] = FAKE_EHR_PATIENTS) {}

  async getPatient(id: string): Promise<EhrPatient> {
    const p = this.patients.find(x => x.id === id);
    if (!p) throw new EhrError(`Fake EHR has no patient ${id}.`, 'not_found', 404);
    return { ...p, identifiers: [...p.identifiers] };
  }

  async searchAppointments(patientId: string, opts: { from?: string } = {}): Promise<EhrAppointment[]> {
    return this.booked
      .filter(a => a.patientId === patientId && (!opts.from || a.start >= opts.from))
      .map(({ patientId: _p, ...a }) => a);
  }

  /** Weekday slots at 9:00, 10:30, 14:00 and 15:30 UTC-5-ish, starting the day after `from`. */
  async findSlots(input: FindSlotsInput): Promise<EhrSlot[]> {
    const out: EhrSlot[] = [];
    const from = new Date(input.from), to = new Date(input.to);
    const bookedStarts = new Set(this.booked.map(b => b.start));
    for (let d = 1; d <= 30 && out.length < 10; d++) {
      const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + d));
      if (day > to) break;
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      for (const [h, m] of [[14, 0], [15, 30], [19, 0], [20, 30]]) {
        const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)).toISOString();
        if (bookedStarts.has(start) || out.length >= 10) continue;
        const slot: EhrSlot = {
          ref: `fake-slot-${start}`, start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
          visitType: 'Office Visit', provider: 'Physician Family Medicine, MD', department: 'Fake Family Medicine',
        };
        this.proposed.set(slot.ref, slot);
        out.push(slot);
      }
    }
    return out;
  }

  async bookSlot(input: BookSlotInput): Promise<EhrAppointment> {
    const slot = this.proposed.get(input.slotRef);
    if (!slot || this.takenRefs.has(input.slotRef) || this.booked.some(b => b.start === slot.start)) {
      throw new EhrError('Fake EHR: that slot is no longer available.', 'slot_unavailable', 400);
    }
    if (!this.patients.some(p => p.id === input.patientId)) throw new EhrError('Fake EHR: unknown patient.', 'not_found', 404);
    const appt = {
      id: `fake-appt-${this.booked.length + 1}`, start: slot.start, end: slot.end, status: 'booked',
      visitType: slot.visitType, provider: slot.provider, department: slot.department, note: input.note,
      patientId: input.patientId,
    };
    this.booked.push(appt);
    this.proposed.delete(input.slotRef);
    const { patientId: _p, ...rest } = appt;
    return rest;
  }

  async ping(): Promise<{ ok: true }> {
    return { ok: true };
  }
}
