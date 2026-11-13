-- Relay — initial schema (plain Postgres; works on local Postgres, PGlite and AWS RDS).
--
-- Converted from the old supabase-setup.sql:
--   * Supabase-only parts removed (RLS toggles, anon-key setup steps).
--   * Seed data moved out of SQL into the seed script (src/server/db/seed.ts),
--     which derives FAKE data from src/lib/mockData.ts.
--   * Audit log now records WHO acted (actor id / name / role) and an action code.
--   * Practice settings now live in the database instead of browser localStorage.
--
-- Access model: only the Relay server talks to this database. There are no
-- browser-facing roles, so no row-level security is needed here.
-- Requires Postgres 13+ (gen_random_uuid is built in).

create table if not exists patients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  date_of_birth date,
  sex           text,
  phone         text,
  language      text not null default 'English',
  insurance     text,
  created_at    timestamptz not null default now()
);

create table if not exists referrals (
  id                   text primary key,
  patient_id           uuid not null references patients(id) on delete cascade,
  reason               text,
  referring_provider   text,
  referral_source      text,
  referral_time        timestamptz not null default now(),
  location             text not null default 'Mission Bay',
  priority             text not null default 'normal'
                         check (priority in ('urgent', 'normal')),
  state                text not null default 'Queued'
                         check (state in ('Queued', 'In Progress', 'Attempted',
                                          'Pending Confirmation', 'Booked', 'Escalated')),
  escalation_reason    text,
  escalation_severity  text check (escalation_severity in ('high', 'med', 'low')),
  escalation_raised_at timestamptz,
  escalation_owner     text,
  updated_at           timestamptz not null default now()
);

create index if not exists referrals_state_idx on referrals (state);
create index if not exists referrals_patient_idx on referrals (patient_id);

create table if not exists call_attempts (
  id                uuid primary key default gen_random_uuid(),
  referral_id       text not null references referrals(id) on delete cascade,
  attempted_at      timestamptz not null default now(),
  channel           text not null default 'voice' check (channel in ('voice', 'sms')),
  outcome           text,
  duration_secs     integer,
  disclosure_played boolean not null default false,
  summary           text,
  transcript        jsonb not null default '[]'::jsonb,
  slot_day          text
);

create index if not exists call_attempts_referral_idx on call_attempts (referral_id, attempted_at);

create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  referral_id   text not null references referrals(id) on delete cascade,
  status        text not null default 'captured'
                  check (status in ('captured', 'confirmed', 'expired', 'cancelled')),
  day           text,
  time          text,
  provider      text,
  captured_at   timestamptz not null default now(),
  confirmed_at  timestamptz,
  confirmed_by  text,
  mirror_status text not null default 'pending'
                  check (mirror_status in ('mirrored', 'pending', 'failed'))
);

create index if not exists appointments_referral_idx on appointments (referral_id, status);

-- Audit trail. Every mutation and every referral-detail view writes a row.
-- referral_id is kept nullable / set null so audit rows outlive deleted referrals.
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  referral_id text references referrals(id) on delete set null,
  created_at  timestamptz not null default now(),
  actor_id    text,               -- session user id (Cognito sub or mock id); null = system
  actor_name  text,               -- display name shown in the referral timeline
  actor_role  text,               -- 'ma' | 'admin' | 'system' | 'ai'
  action      text not null,      -- machine-readable code, e.g. 'slot.confirm', 'referral.view'
  what        text not null       -- human-readable line shown in the timeline
);

create index if not exists audit_log_referral_idx on audit_log (referral_id, created_at);
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at);

-- Practice-wide settings (one row, id = 'default'). Admin-only writes.
create table if not exists practice_settings (
  id         text primary key default 'default',
  settings   jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
