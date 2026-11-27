// "Reset demo" (Settings → Demo data, admin only). Deletes Relay's own demo data —
// every table that holds per-patient or per-referral rows — so a trial can be re-run
// from an empty app. Keeps practice configuration: users/sessions (cookie-based, no
// table), practice and SMS settings, saved eCW column mappings and any Epic settings.
//
// Refused with NODE_ENV=production unless DEMO_RESET_ENABLED=true.
// No 'server-only' import so tests can call it against an in-memory database.

import type { Db, Queryable } from './db/driver';
import type { SessionUser } from '@/lib/auth-types';

/**
 * Tables emptied by the reset, in FK-safe order (children before parents).
 * Every table in db/migrations must appear here or in KEPT_TABLES; a test enforces it,
 * so a new migration has to decide which side its tables belong on.
 */
export const RESET_TABLES = [
  'ecw_import_review',    // eCW rows staff must decide on (row data, candidate referrals)
  'ecw_busy_slots',       // busy times from uploaded schedules
  'ecw_appointments',     // eCW appointments matched to referrals
  'ecw_imports',          // upload drafts / history
  'needs_human_items',    // amber "needs a human" items
  'sms_conversations',    // per-referral texting state, offered/captured slots
  'messages',             // every SMS in or out, held and suppressed included
  'sms_inbound_events',   // inbound webhook de-dupe ids
  'appointments',         // captured and confirmed slots (calendar mirror)
  'call_attempts',        // outreach attempts (outreach log)
  'referrals',
  'patients',
] as const;

/** Tables the reset never touches (configuration, not patient data). */
export const KEPT_TABLES = [
  'practice_settings',
  'sms_settings',
  'ecw_import_profiles',  // saved column mappings
  'epic_settings',        // Epic sandbox settings, if that migration is present
  'schema_migrations',
] as const;

/**
 * audit_log rows with no referral that record practice settings changes. They are kept;
 * every other audit row (per-referral history, eCW upload/apply lines) is deleted.
 */
const KEPT_AUDIT_ACTIONS = ['sms.settings', 'sms.kill_switch', 'sms.approval_mode', 'ecw.profile', 'demo.reset'];

export class DemoResetRefused extends Error {}

/** Throws DemoResetRefused when the reset is not allowed in this environment. */
export function assertDemoResetAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_RESET_ENABLED !== 'true') {
    throw new DemoResetRefused(
      'Reset demo is turned off on this server (production). Set DEMO_RESET_ENABLED=true only on a demo deployment with fake data.');
  }
}

export interface DemoResetResult {
  deleted: Record<string, number>;
  total: number;
}

async function count(q: Queryable, sql: string, params?: unknown[]): Promise<number> {
  const { rows } = await q.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

export async function resetDemoData(db: Db, actor: Pick<SessionUser, 'id' | 'name' | 'role'>): Promise<DemoResetResult> {
  assertDemoResetAllowed();

  return db.transaction(async tx => {
    const deleted: Record<string, number> = {};

    // Audit rows first: referral FKs are "on delete set null", so delete per-referral
    // history before its referrals go, then any orphaned non-settings rows.
    deleted.audit_log = await count(tx,
      `with d as (delete from audit_log where referral_id is not null or not (action = any($1::text[])) returning 1)
       select count(*)::int as n from d`, [KEPT_AUDIT_ACTIONS]);

    for (const table of RESET_TABLES) {
      if (!(await tableExists(tx, table))) continue;
      deleted[table] = await count(tx, `with d as (delete from ${table} returning 1) select count(*)::int as n from d`);
    }

    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    await tx.query(
      `insert into audit_log (referral_id, actor_id, actor_name, actor_role, action, what)
       values (null, $1, $2, $3, 'demo.reset', $4)`,
      [actor.id, actor.name, actor.role, `Demo data reset: ${deleted.referrals ?? 0} referrals and ${deleted.patients ?? 0} patients deleted`],
    );
    console.log(`[relay] demo reset by ${actor.role} ${actor.id}: ${total} rows deleted`);
    return { deleted, total };
  });
}

async function tableExists(q: Queryable, table: string): Promise<boolean> {
  const { rows } = await q.query<{ ok: boolean }>(`select to_regclass($1) is not null as ok`, [`public.${table}`]);
  return rows[0]?.ok === true;
}
