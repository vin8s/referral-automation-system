-- Relay — Epic FHIR sandbox prototype (2026-11-16). See docs/EPIC_PROTOTYPE_PLAN.md.
--
-- Native booking is a SANDBOX PROTOTYPE ONLY: with epic_settings.booking_enabled
-- on, the MA's Confirm books the captured slot in the Epic sandbox ($book). Off
-- (the default) = pure connector mode, exactly as before.
--
-- Safe for existing databases: one new settings table and nullable columns.

create table if not exists epic_settings (
  id               text primary key default 'default',
  booking_enabled  boolean not null default false,
  -- Simulated referral feed: [{ "fhirId": "...", "visitType": "95014", "specialty": "Family Medicine" }]
  patients         jsonb   not null default '[]'::jsonb,
  last_sync_at     timestamptz,
  last_sync_result jsonb,
  updated_at       timestamptz not null default now(),
  updated_by       text
);
insert into epic_settings (id) values ('default') on conflict (id) do nothing;

-- Link a Relay patient to its Epic sandbox Patient FHIR ID.
alter table patients add column if not exists epic_patient_id text;
create unique index if not exists patients_epic_patient_id_key on patients (epic_patient_id) where epic_patient_id is not null;

-- Epic references on an appointment:
--   epic_slot_ref        the proposed Appointment id returned by $find (what $book needs)
--   epic_appointment_id  the booked Appointment id returned by $book
alter table appointments add column if not exists epic_slot_ref       text;
alter table appointments add column if not exists epic_appointment_id text;
