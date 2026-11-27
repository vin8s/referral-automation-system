-- Owner decision 2026-11-27: Relay texts patients in whatever language they write in.
-- English/Spanish stay in locked_language (fixed texts exist in both). Any other language
-- (e.g. 'Portuguese') is kept here; fixed texts are then translated by the AI before sending.
alter table sms_conversations add column if not exists reply_language text;
