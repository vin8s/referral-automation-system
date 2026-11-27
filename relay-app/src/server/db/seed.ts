// Seeds the database with FAKE data derived from src/lib/mockData.ts.
// No 'server-only' import so scripts/db.ts can use it.

import type { Db, Queryable } from './driver';
import { referrals as mockReferrals } from '../../lib/mockData';

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** "Apr 14, 8:21 AM" → ISO timestamp in 2026, Pacific daylight time (the mock clinic's zone). */
function mockTimeToIso(s: string | undefined, fallback?: string): string {
  const m = s?.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!m) return fallback ?? new Date().toISOString();
  let h = parseInt(m[3], 10) % 12;
  if (m[5] === 'PM') h += 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `2026-${pad(MONTHS[m[1]])}-${pad(parseInt(m[2], 10))}T${pad(h)}:${m[4]}:00-07:00`;
}

function addMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

/** "03/12/1959" → "1959-03-12" */
function mdyToIso(dob: string): string | null {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/**
 * Fake eCW MRN for a seeded referral: "REF-1042" → "201042". The sample eCW export
 * (test/fixtures/ecw-appointments-sample.csv) uses these numbers.
 */
export function seedMrn(referralId: string): string {
  return `20${referralId.replace(/\D/g, '')}`;
}

/**
 * Development databases seeded before migration 003 have no MRNs: fill them in for
 * seed patients only (identified by the seed consent marker). Real data is never touched.
 * The same person (name + DOB) gets the MRN of their lowest referral id, as in insertAll.
 */
export async function backfillSeedMrns(db: Queryable): Promise<void> {
  await db.query(
    `update patients p set mrn = x.mrn
       from (select p2.id, '20' || regexp_replace(min(r2.id) over (partition by p2.name, p2.date_of_birth), '[^0-9]', '', 'g') as mrn
               from patients p2 join referrals r2 on r2.patient_id = p2.id) x
      where x.id = p.id and p.mrn is null and p.sms_consent_source = 'seed (fake data)'`);
}

function actorFor(who: string): { name: string | null; role: string } {
  if (who === 'AI agent') return { name: 'AI agent', role: 'ai' };
  if (who === 'System') return { name: null, role: 'system' };
  return { name: who, role: 'ma' };
}

async function insertAll(tx: Queryable): Promise<void> {
  const mrnByPerson = new Map<string, string>();   // the same person (name + DOB) keeps one MRN
  for (const r of mockReferrals) {
    const p = r.patient;
    const person = `${p.name}|${p.dateOfBirth}`;
    if (!mrnByPerson.has(person)) mrnByPerson.set(person, seedMrn(r.id));
    const { rows } = await tx.query<{ id: string }>(
      `insert into patients (name, date_of_birth, sex, phone, language, insurance, mrn)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [p.name, mdyToIso(p.dateOfBirth), p.sex, p.phone, p.language, p.insurance, mrnByPerson.get(person)],
    );
    const patientId = rows[0].id;
    const referralTime = mockTimeToIso(r.referralTime);

    await tx.query(
      `insert into referrals (id, patient_id, reason, referring_provider, referral_source, referral_time,
         location, priority, state, escalation_reason, escalation_severity, escalation_raised_at, escalation_owner,
         specialty)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        r.id, patientId, r.reason, r.referringProvider, r.referralSource, referralTime,
        r.location, r.priority, r.state,
        r.escalation?.reason ?? null, r.escalation?.severity ?? null,
        r.escalation ? mockTimeToIso(r.escalation.raisedAt) : null, r.escalation?.owner ?? null,
        r.specialty ?? 'Primary care',
      ],
    );

    // Text-outreach attempts (Relay is SMS-only). Open referrals also get the matching
    // messages so their text thread and the confirm-queue excerpts show the conversation
    // (booked ones keep only the attempt summary, so their thread starts clean).
    const seedMessages = r.state !== 'Booked';
    for (const a of r.attempts) {
      const at = mockTimeToIso(a.timestamp, referralTime);
      await tx.query(
        `insert into call_attempts (referral_id, attempted_at, channel, outcome,
           disclosure_played, summary, transcript, slot_day)
         values ($1,$2,'sms',$3,true,$4,$5::jsonb,$6)`,
        [r.id, at, a.outcome, a.summary, JSON.stringify(a.transcript), a.slotDay ?? null],
      );
      for (const [i, t] of (seedMessages ? a.transcript : []).entries()) {
        const out = t.who === 'ai';
        await tx.query(
          `insert into messages (referral_id, patient_id, direction, author, body, status, provider, created_at, sent_at)
           values ($1,$2,$3,$4,$5,$6,'mock',$7,$8)`,
          [r.id, patientId, out ? 'outbound' : 'inbound', out ? 'ai' : 'patient', t.text,
            out ? 'delivered' : 'received', addMinutes(at, i), out ? addMinutes(at, i) : null],
        );
      }
    }

    if (r.bookedAppointment) {
      const b = r.bookedAppointment;
      const confirmedAt = mockTimeToIso(b.confirmedAt, referralTime);
      await tx.query(
        `insert into appointments (referral_id, status, day, time, provider, captured_at,
           confirmed_at, confirmed_by, mirror_status)
         values ($1,'confirmed',$2,$3,$4,$5,$6,$7,$8)`,
        [r.id, b.day, b.time, b.provider, addMinutes(confirmedAt, -60), confirmedAt, b.confirmedBy, b.mirrorStatus],
      );
    } else if (r.capturedSlot) {
      const s = r.capturedSlot;
      const capturedAt = new Date(Date.now() - (s.capturedAgoMin ?? 0) * 60_000).toISOString();
      await tx.query(
        `insert into appointments (referral_id, status, day, time, provider, captured_at, mirror_status)
         values ($1,'captured',$2,$3,$4,$5,'pending')`,
        [r.id, s.day, s.time, s.provider, capturedAt],
      );
    }

    for (const e of r.audit) {
      const actor = actorFor(e.who);
      await tx.query(
        `insert into audit_log (referral_id, created_at, actor_id, actor_name, actor_role, action, what)
         values ($1,$2,$3,$4,$5,'seed',$6)`,
        [r.id, mockTimeToIso(e.at, addMinutes(referralTime, 1)), null, actor.name, actor.role, e.what],
      );
    }
  }

  // Fake patients only: record SMS consent so the texting pilot can be demoed
  // locally. Real patients start with consent = false (002_sms.sql) until staff record it.
  await tx.query(
    `update patients set sms_consent = true, sms_consent_at = now(), sms_consent_source = 'seed (fake data)'`);
}

/**
 * Whether `npm run dev` should load the fake referrals/patients into an empty database.
 * Off unless SEED_FAKE_DATA=true (the app starts empty); never in production.
 * Tests and `npm run db:seed` call seedIfEmpty() directly instead (explicit opt-in).
 */
export function fakeSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return ['true', '1', 'yes'].includes((env.SEED_FAKE_DATA ?? '').trim().toLowerCase());
}

/** Inserts the fake seed data. Returns false (and does nothing) if referrals already exist. */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from referrals');
  if (rows[0].n > 0) return false;
  await db.transaction(insertAll);
  return true;
}

/** Deletes all app data (keeps the schema). Used by `npm run db:reset`. */
export async function truncateAll(db: Db): Promise<void> {
  await db.query(`truncate ecw_import_review, ecw_busy_slots, ecw_appointments, ecw_imports, ecw_import_profiles,
    audit_log, appointments, call_attempts, messages, sms_conversations, needs_human_items,
    sms_inbound_events, referrals, patients, practice_settings`);
}
