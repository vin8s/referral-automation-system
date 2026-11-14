-- Relay — eCW schedule import (CSV / Excel appointment report export).
--
-- Connector mode: Relay only READS the eCW schedule. Nothing here writes to eCW.
-- Staff upload the appointment report once or twice a day; Relay matches rows to
-- referrals and mirrors bookings, time changes, cancellations and visits.
--
-- What is kept (see relay-app/README.md "eCW schedule import"):
--   * The raw file is never stored. Parsed cells are kept on the import record
--     only while it is a draft (preview), and are cleared on apply, discard or
--     after 24 hours.
--   * After apply: counts + date range, the eCW appointments that matched a
--     referral, review items, and anonymous busy times (no patient identity) for
--     slot conflicts. Rows for patients with no referral are counted, not stored.
-- Never edit 001/002; later changes go in 004_*.sql.

-- eCW Medical Record / Account number, matched exactly on import.
alter table patients add column if not exists mrn text;
create index if not exists patients_mrn_idx on patients (mrn) where mrn is not null;

-- eCW identity + visit status on the mirrored appointment.
alter table appointments add column if not exists source       text not null default 'relay'
  check (source in ('relay', 'ecw_import'));
alter table appointments add column if not exists ecw_appt_key text;
alter table appointments add column if not exists visit_status text
  check (visit_status in ('arrived', 'completed'));

-- ── Saved column mappings (practice-level, reusable) ────────────────────────
create table if not exists ecw_import_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  mapping     jsonb not null,               -- { field: "Header text" }
  options     jsonb not null default '{}'::jsonb,
  headers     jsonb not null default '[]'::jsonb,  -- header row it was saved from (auto-pick next time)
  updated_at  timestamptz not null default now(),
  updated_by  text,
  last_used_at timestamptz
);

-- ── One row per upload ──────────────────────────────────────────────────────
create table if not exists ecw_imports (
  id              uuid primary key default gen_random_uuid(),
  status          text not null default 'draft'
                    check (status in ('draft', 'applied', 'discarded', 'expired')),
  file_name       text not null,
  file_sha256     text not null,
  file_bytes      integer not null,
  row_count       integer not null default 0,
  headers         jsonb not null default '[]'::jsonb,
  raw_rows        jsonb,                    -- parsed cells; DRAFT ONLY, cleared on apply/discard/expiry
  mapping         jsonb,
  options         jsonb,
  profile_id      uuid references ecw_import_profiles(id) on delete set null,
  range_start     date,
  range_end       date,
  counts          jsonb,
  created_at      timestamptz not null default now(),
  created_by_id   text,
  created_by_name text,
  applied_at      timestamptz,
  applied_by_id   text,
  applied_by_name text
);

create index if not exists ecw_imports_applied_idx on ecw_imports (applied_at desc) where status = 'applied';

-- ── eCW appointments that matched a referral (idempotency + audit) ──────────
-- appt_key = "id:<eCW appointment id>" when the report has one, otherwise
-- "k:<MRN or name+DOB>|<local date+time>|<provider>".
create table if not exists ecw_appointments (
  appt_key       text primary key,
  referral_id    text not null references referrals(id) on delete cascade,
  start_at       timestamptz not null,
  day            text not null,             -- "Tue Nov 17" (calendar format)
  time           text not null,             -- "10:30 AM"
  duration_min   integer,
  provider       text,
  facility       text,
  visit_type     text,
  status_raw     text,
  category       text not null check (category in ('scheduled', 'arrived', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  first_import_id uuid references ecw_imports(id) on delete set null,
  last_import_id  uuid references ecw_imports(id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index if not exists ecw_appointments_referral_idx on ecw_appointments (referral_id);

-- ── Busy times from the eCW schedule (no patient identity) ──────────────────
-- Replaced for the covered date range on every applied import. The SMS agent
-- and the voice flow never offer a slot that overlaps one of these.
create table if not exists ecw_busy_slots (
  id           uuid primary key default gen_random_uuid(),
  import_id    uuid references ecw_imports(id) on delete cascade,
  local_date   date not null,
  start_min    integer not null,            -- minutes after local midnight
  duration_min integer not null,
  provider     text
);

create index if not exists ecw_busy_slots_date_idx on ecw_busy_slots (local_date);

-- ── Rows staff must decide on (ambiguous / possible match / conflicts) ──────
create table if not exists ecw_import_review (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null references ecw_imports(id) on delete cascade,
  row_number    integer not null,
  appt_key      text,                       -- re-uploads don't duplicate open/ignored items
  reason       text not null,              -- machine code, e.g. 'ambiguous', 'possible_match'
  detail        text,
  row_data      jsonb not null,             -- normalized mapped fields of this row only
  candidates    jsonb not null default '[]'::jsonb,
  status        text not null default 'open' check (status in ('open', 'matched', 'ignored')),
  resolved_referral_id text references referrals(id) on delete set null,
  resolved_by   text,
  resolved_at   timestamptz,
  outcome       text,
  created_at    timestamptz not null default now()
);

create index if not exists ecw_import_review_open_idx on ecw_import_review (import_id) where status = 'open';
