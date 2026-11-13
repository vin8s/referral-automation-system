-- Relay — SMS texting (pilot channel).
--
-- Adds: patient SMS consent / opt-out, the message store, per-referral SMS
-- conversation state, amber "needs a human" items, inbound webhook de-dupe and
-- practice-level outreach settings (kill switch, quiet hours, cadence, caps).
--
-- Values follow docs/AGENT_SAFETY_RULES.md (R6 consent/opt-out, R7 timing/caps).
-- Never edit 001_init.sql; later changes go in 003_*.sql.

-- ── Patient consent + opt-out (R6) ──────────────────────────────────────────
-- Consent defaults to false: nobody is texted until staff record consent.
alter table patients add column if not exists sms_consent         boolean not null default false;
alter table patients add column if not exists sms_consent_at      timestamptz;
alter table patients add column if not exists sms_consent_source  text;     -- e.g. 'intake form', 'verbal (staff)', 'START keyword'
alter table patients add column if not exists sms_opted_out       boolean not null default false;
alter table patients add column if not exists sms_opted_out_at    timestamptz;
alter table patients add column if not exists sms_opt_out_source  text;     -- keyword ('STOP') or 'natural language' / 'staff'

-- ── Messages (every SMS in or out, including held and suppressed ones) ──────
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  referral_id         text references referrals(id) on delete cascade,  -- null = inbound from an unknown number
  patient_id          uuid references patients(id) on delete set null,
  direction           text not null check (direction in ('inbound', 'outbound')),
  author              text not null check (author in ('patient', 'template', 'ai', 'staff', 'system')),
  body                text not null,
  template_key        text,
  status              text not null
                        check (status in ('received', 'held', 'sending', 'sent', 'delivered', 'failed', 'suppressed')),
  provider            text,                      -- 'mock' | 'aws'
  provider_message_id text,
  segments            integer,
  encoding            text check (encoding in ('GSM-7', 'UCS-2')),
  from_number         text,
  to_number           text,
  error_code          text,
  send_after          timestamptz,               -- for status 'held' (quiet hours)
  sent_by             text,                      -- staff name for author 'staff'
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz
);

create index if not exists messages_referral_idx on messages (referral_id, created_at);
create index if not exists messages_held_idx on messages (status, send_after) where status = 'held';
create unique index if not exists messages_provider_id_uidx
  on messages (provider, provider_message_id) where provider_message_id is not null;

-- ── Per-referral SMS conversation state ─────────────────────────────────────
create table if not exists sms_conversations (
  referral_id           text primary key references referrals(id) on delete cascade,
  locked_language       text check (locked_language in ('en', 'es')),
  identity_verified     boolean not null default false,
  identity_verified_at  timestamptz,                 -- verification expires after 7 days (R4.4)
  identity_attempts     integer not null default 0,
  offered_slots         jsonb not null default '[]'::jsonb,
  rejected_slot_keys    jsonb not null default '[]'::jsonb,  -- MA-rejected slots, never re-offered
  captured_slot_id      text,
  preferences           jsonb,
  friction              jsonb not null default '[]'::jsonb,
  outreach_count        integer not null default 0,  -- unsolicited texts sent, lifetime (cap R7.3)
  cycle_step            integer not null default 0,  -- next step in the 0/2/5/9 cycle (0 = not started)
  cycle_started_at      timestamptz,
  last_outreach_at      timestamptz,
  last_inbound_at       timestamptz,
  last_outbound_at      timestamptz,
  replied_since_outreach boolean not null default false,
  paused                boolean not null default false,
  paused_reason         text,
  channel_preference    text not null default 'sms' check (channel_preference in ('sms', 'voice', 'none')),
  number_suppressed     boolean not null default false,  -- wrong number (R4.5)
  redirects_used        integer not null default 0,
  ai_messages_day       text,                        -- local date YYYY-MM-DD of ai_messages_today
  ai_messages_today     integer not null default 0,
  exhausted             boolean not null default false,
  updated_at            timestamptz not null default now()
);

-- ── Amber "needs a human" items (R2). Never changes the referral state. ─────
create table if not exists needs_human_items (
  id               uuid primary key default gen_random_uuid(),
  referral_id      text not null references referrals(id) on delete cascade,
  reason_code      text not null,
  summary          text,
  pause_automation boolean not null default false,
  source           text not null default 'sms',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      text
);

create index if not exists needs_human_open_idx on needs_human_items (referral_id) where resolved_at is null;

-- ── Inbound webhook de-dupe (SNS MessageId) ─────────────────────────────────
create table if not exists sms_inbound_events (
  sns_message_id text primary key,
  received_at    timestamptz not null default now()
);

-- ── Practice-level outreach settings (one row, id = 'default') ──────────────
create table if not exists sms_settings (
  id                    text primary key default 'default',
  texting_paused        boolean not null default false,       -- "Pause all texting" kill switch
  quiet_start           text not null default '08:00',        -- local clinic time, HH:MM
  quiet_end             text not null default '20:00',
  allowed_days          jsonb not null default '[1,2,3,4,5,6]'::jsonb,  -- 0 = Sunday … 6 = Saturday
  holidays              jsonb not null default '[]'::jsonb,   -- ['2026-12-25', …]
  cadence_days          jsonb not null default '[0,2,5,9]'::jsonb,
  lifetime_cap          integer not null default 6,
  min_spacing_hours     integer not null default 48,
  exhausted_after_hours integer not null default 72,
  ai_daily_cap          integer not null default 15,
  updated_at            timestamptz not null default now(),
  updated_by            text
);

insert into sms_settings (id) values ('default') on conflict (id) do nothing;
