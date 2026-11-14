-- Relay — SMS-only (2026-11-14). Voice outreach (AI phone calls) was removed.
--
-- Safe for existing databases: no tables or columns are renamed or dropped, and
-- no rows are deleted. call_attempts keeps its historical name; it now records
-- text-outreach attempts only. Old voice rows, if any, stay for the record but
-- the app no longer reads or shows them.

-- New attempts default to SMS.
alter table call_attempts alter column channel set default 'sms';

-- 'voice' is no longer a valid outreach preference. A patient who preferred
-- voice must not suddenly start receiving automated texts, so map it to 'none'
-- (staff contact only).
update sms_conversations set channel_preference = 'none' where channel_preference = 'voice';

alter table sms_conversations drop constraint if exists sms_conversations_channel_preference_check;
alter table sms_conversations
  add constraint sms_conversations_channel_preference_check check (channel_preference in ('sms', 'none'));
