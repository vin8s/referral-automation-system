-- Relay — pilot mode: staff approve a referral before its first text (2026-11-14).
--
-- When sms_settings.approval_required is true (the default, used for the Rhode
-- Island Free Clinic pilot), the outreach scheduler does not send the FIRST text
-- of a referral until a staff member approves it on the dashboard ("Ready to
-- text"). Follow-ups, replies and everything after the first text are unchanged.
-- Turning approval_required off in Settings makes outreach fully automatic.
--
-- Safe for existing databases: adds nullable columns and one defaulted flag.
alter table referrals add column if not exists outreach_approved_at timestamptz;
alter table referrals add column if not exists outreach_approved_by text;
alter table sms_settings add column if not exists approval_required boolean not null default true;
