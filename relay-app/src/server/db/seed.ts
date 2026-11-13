// Seeds the database with FAKE data derived from src/lib/mockData.ts.
// No 'server-only' import so scripts/db.ts can use it.

import type { Db, Queryable } from './driver';
import { referrals as mockReferrals } from '../../lib/mockData';
import { DEFAULT_SETTINGS } from '../../lib/settingsDefaults';

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

/** "3:24" → 204, "0:00" → 0, "—" → null */
function mockDurationToSecs(d: string): number | null {
  const m = d.match(/^(\d+):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

/** "03/12/1959" → "1959-03-12" */
function mdyToIso(dob: string): string | null {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function actorFor(who: string): { name: string | null; role: string } {
  if (who === 'AI agent') return { name: 'AI agent', role: 'ai' };
  if (who === 'System') return { name: null, role: 'system' };
  return { name: who, role: 'ma' };
}

async function insertAll(tx: Queryable): Promise<void> {
  for (const r of mockReferrals) {
    const p = r.patient;
    const { rows } = await tx.query<{ id: string }>(
      `insert into patients (name, date_of_birth, sex, phone, language, insurance)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [p.name, mdyToIso(p.dateOfBirth), p.sex, p.phone, p.language, p.insurance],
    );
    const patientId = rows[0].id;
    const referralTime = mockTimeToIso(r.referralTime);

    await tx.query(
      `insert into referrals (id, patient_id, reason, referring_provider, referral_source, referral_time,
         location, priority, state, escalation_reason, escalation_severity, escalation_raised_at, escalation_owner)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.id, patientId, r.reason, r.referringProvider, r.referralSource, referralTime,
        r.location, r.priority, r.state,
        r.escalation?.reason ?? null, r.escalation?.severity ?? null,
        r.escalation ? mockTimeToIso(r.escalation.raisedAt) : null, r.escalation?.owner ?? null,
      ],
    );

    for (const a of r.attempts) {
      await tx.query(
        `insert into call_attempts (referral_id, attempted_at, channel, outcome, duration_secs,
           disclosure_played, summary, transcript, slot_day)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          r.id, mockTimeToIso(a.timestamp, referralTime), a.channel, a.outcome,
          mockDurationToSecs(a.duration), a.disclosurePlayed, a.summary,
          JSON.stringify(a.transcript), a.slotDay ?? null,
        ],
      );
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

  await tx.query(
    `insert into practice_settings (id, settings) values ('default', $1::jsonb)
     on conflict (id) do nothing`,
    [JSON.stringify(DEFAULT_SETTINGS)],
  );
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
  await db.query('truncate audit_log, appointments, call_attempts, referrals, patients, practice_settings');
}
