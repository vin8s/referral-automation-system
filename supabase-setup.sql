-- ═══════════════════════════════════════════════════════════════════════════════
-- Relay — Supabase schema + seed data
-- Steps:
--   1. Create a free project at supabase.com
--   2. Go to SQL Editor → New query
--   3. Paste this entire file and click Run
--   4. Copy your project URL + anon key from Settings → API
--   5. Update NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Tables ─────────────────────────────────────────────────────────────────

create table if not exists patients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  date_of_birth date,
  sex           text,
  phone         text,
  language      text default 'English',
  insurance     text
);

create table if not exists referrals (
  id                   text primary key,
  patient_id           uuid references patients(id) on delete cascade,
  reason               text,
  referring_provider   text,
  referral_source      text,
  referral_time        timestamptz default now(),
  location             text default 'Mission Bay',
  priority             text default 'normal',
  state                text default 'Queued',
  escalation_reason    text,
  escalation_severity  text,
  escalation_raised_at timestamptz,
  updated_at           timestamptz default now()
);

create table if not exists call_attempts (
  id                uuid primary key default gen_random_uuid(),
  referral_id       text references referrals(id) on delete cascade,
  attempted_at      timestamptz default now(),
  channel           text default 'voice',
  outcome           text,
  duration_secs     integer,
  disclosure_played boolean default false,
  summary           text,
  transcript        jsonb default '[]'
);

create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  referral_id   text references referrals(id) on delete cascade,
  status        text default 'captured',
  day           text,
  time          text,
  provider      text,
  captured_at   timestamptz default now(),
  confirmed_at  timestamptz,
  mirror_status text default 'pending'
);

create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  referral_id  text references referrals(id) on delete cascade,
  created_at   timestamptz default now(),
  user_id      text,
  what         text not null
);

-- Disable RLS for prototype (add policies when you go to production)
alter table patients       disable row level security;
alter table referrals      disable row level security;
alter table call_attempts  disable row level security;
alter table appointments   disable row level security;
alter table audit_log      disable row level security;


-- ── 2. Patients ───────────────────────────────────────────────────────────────

insert into patients (id, name, date_of_birth, sex, phone, language, insurance) values
  ('a1000000-0000-0000-0000-000000000001', 'James Okafor',   '1959-03-12', 'M', '+19197577586', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000002', 'Robert Klein',   '1954-01-08', 'M', '+13604815266', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000003', 'Patricia Walsh', '1958-05-03', 'F', '+14155550192', 'English',    'Medicare Advantage'),
  ('a1000000-0000-0000-0000-000000000004', 'James Tan',      '1971-08-14', 'M', '+14155550374', 'English',    'Aetna'),
  ('a1000000-0000-0000-0000-000000000005', 'Maria Delgado',  '1968-07-22', 'F', '+19197577586', 'Spanish',    'Blue Shield PPO'),
  ('a1000000-0000-0000-0000-000000000006', 'Walter Briggs',  '1962-09-03', 'M', '+13604815266', 'English',    'Aetna'),
  ('a1000000-0000-0000-0000-000000000007', 'Yuki Tanaka',    '1975-04-15', 'F', '+19197577586', 'English',    'Kaiser'),
  ('a1000000-0000-0000-0000-000000000008', 'Grace Mwangi',   '1981-02-28', 'F', '+13604815266', 'English',    'United PPO'),
  ('a1000000-0000-0000-0000-000000000009', 'Daniel Reyes',   '1966-11-11', 'M', '+19197577586', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000010', 'Helen Park',     '1957-06-30', 'F', '+13604815266', 'Korean',     'Medicare Advantage'),
  ('a1000000-0000-0000-0000-000000000011', 'Marcus Hill',    '1971-08-19', 'M', '+19197577586', 'English',    'Cigna'),
  ('a1000000-0000-0000-0000-000000000012', 'Helena Brandt',  '1964-03-15', 'F', '+14155550291', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000013', 'Linh Pham',      '1970-08-20', 'F', '+14155550382', 'Vietnamese', 'Medicare Advantage'),
  ('a1000000-0000-0000-0000-000000000014', 'Aisha Patel',    '1978-06-05', 'F', '+14155550417', 'English',    'Blue Shield PPO'),
  ('a1000000-0000-0000-0000-000000000015', 'Beatriz Coelho', '1955-11-30', 'F', '+14155550529', 'Portuguese', 'Medicare'),
  ('a1000000-0000-0000-0000-000000000016', 'Sofia Reyes',    '1961-04-22', 'F', '+14155550634', 'Spanish',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000017', 'Marcus Bell',    '1968-01-07', 'M', '+14155550748', 'English',    'Cigna'),
  ('a1000000-0000-0000-0000-000000000018', 'David Kim',      '1973-09-14', 'M', '+14155550851', 'Korean',     'United PPO'),
  ('a1000000-0000-0000-0000-000000000019', 'Linda Brown',    '1976-05-14', 'F', '+13604815266', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000020', 'Omar Farah',     '1975-12-02', 'M', '+19197577586', 'Spanish',    'Aetna'),
  ('a1000000-0000-0000-0000-000000000021', 'Nina Petrov',    '1974-03-07', 'F', '+13604815266', 'English',    'Blue Shield PPO'),
  ('a1000000-0000-0000-0000-000000000022', 'Carl Jensen',    '1973-10-17', 'M', '+19197577586', 'English',    'United PPO'),
  ('a1000000-0000-0000-0000-000000000023', 'Aisha Bello',    '1972-06-22', 'F', '+13604815266', 'English',    'Kaiser'),
  ('a1000000-0000-0000-0000-000000000024', 'Tom Whitaker',   '1971-01-08', 'M', '+19197577586', 'Mandarin',   'Cigna'),
  ('a1000000-0000-0000-0000-000000000025', 'Sara Kim',       '1970-08-30', 'F', '+13604815266', 'English',    'Medicare Advantage'),
  ('a1000000-0000-0000-0000-000000000026', 'Luis Mendez',    '1969-04-04', 'M', '+19197577586', 'English',    'Medicare'),
  ('a1000000-0000-0000-0000-000000000027', 'Ruth Cohen',     '1968-09-15', 'F', '+13604815266', 'English',    'Aetna'),
  ('a1000000-0000-0000-0000-000000000028', 'Ben Adler',      '1967-02-27', 'M', '+19197577586', 'English',    'Blue Shield PPO');


-- ── 3. Referrals ──────────────────────────────────────────────────────────────

insert into referrals (id, patient_id, reason, referring_provider, referral_source, referral_time, location, priority, state, escalation_reason, escalation_severity, escalation_raised_at) values
  ('REF-1042', 'a1000000-0000-0000-0000-000000000001', 'AFib follow-up',                             'Dr. Chen',              'Bay Cardiology — internal',     '2026-04-14 08:21:00-07', 'Mission Bay', 'normal', 'Pending Confirmation', null, null, null),
  ('REF-1039', 'a1000000-0000-0000-0000-000000000002', 'Post-MI follow-up',                          'SF General — discharge', 'SF General — discharge',        '2026-04-13 16:55:00-07', 'Mission Bay', 'urgent', 'Pending Confirmation', null, null, null),
  ('REF-1063', 'a1000000-0000-0000-0000-000000000003', 'Atrial flutter — EP referral',               'Dr. Park',              'Bay Cardiology — internal',     '2026-04-22 09:00:00-07', 'Mission Bay', 'normal', 'Pending Confirmation', null, null, null),
  ('REF-1064', 'a1000000-0000-0000-0000-000000000004', 'Dyslipidemia — statin management follow-up', 'Dr. Osei (PCP)',        'EHR feed',                      '2026-04-24 08:00:00-07', 'Mission Bay', 'normal', 'Pending Confirmation', null, null, null),
  ('REF-1051', 'a1000000-0000-0000-0000-000000000005', 'New murmur, echo recommended',               'Dr. Alvarez (PCP)',     'Fax — Alvarez Family Medicine', '2026-04-14 07:10:00-07', 'Mission Bay', 'normal', 'In Progress',          null, null, null),
  ('REF-1047', 'a1000000-0000-0000-0000-000000000006', 'Chest pain, urgent eval',                    'Dr. Chen',              'Bay Cardiology — internal',     '2026-04-14 06:02:00-07', 'Mission Bay', 'urgent', 'Escalated',            'Patient reported active chest pain during the call', 'high', '2026-04-14 09:48:00-07'),
  ('REF-1033', 'a1000000-0000-0000-0000-000000000007', 'Palpitations workup',                        'Dr. Osei (PCP)',        'EHR feed',                      '2026-04-12 14:30:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1058', 'a1000000-0000-0000-0000-000000000008', 'Hypertension referral',                      'Dr. Alvarez (PCP)',     'Fax — Alvarez Family Medicine', '2026-04-14 07:45:00-07', 'Mission Bay', 'normal', 'Queued',               null, null, null),
  ('REF-1059', 'a1000000-0000-0000-0000-000000000009', 'Pre-op cardiac clearance',                   'Ortho — Dr. Singh',    'Referral platform',             '2026-04-14 07:58:00-07', 'Mission Bay', 'urgent', 'Queued',               null, null, null),
  ('REF-1061', 'a1000000-0000-0000-0000-000000000010', 'Heart failure follow-up',                    'SF General — discharge','SF General — discharge',        '2026-04-14 06:40:00-07', 'Mission Bay', 'normal', 'Queued',               null, null, null),
  ('REF-1062', 'a1000000-0000-0000-0000-000000000011', 'Abnormal EKG',                               'Dr. Osei (PCP)',        'EHR feed',                      '2026-04-14 08:05:00-07', 'Mission Bay', 'normal', 'Queued',               null, null, null),
  ('REF-1086', 'a1000000-0000-0000-0000-000000000012', 'Pre-op cardiac clearance',                   'Ortho — Dr. Nguyen',   'Referral platform',             '2026-04-10 09:00:00-07', 'Mission Bay', 'urgent', 'Booked',               null, null, null),
  ('REF-1087', 'a1000000-0000-0000-0000-000000000013', 'CHF management follow-up',                   'SF General — discharge','SF General — discharge',        '2026-04-11 08:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1088', 'a1000000-0000-0000-0000-000000000014', 'HTN consult',                                'Dr. Osei (PCP)',        'EHR feed',                      '2026-04-12 08:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1089', 'a1000000-0000-0000-0000-000000000015', 'Palpitations evaluation',                    'Dr. Alvarez (PCP)',     'Fax — Alvarez Family Medicine', '2026-04-12 11:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1090', 'a1000000-0000-0000-0000-000000000016', 'Annual cardiac screening',                   'Dr. Chen',              'Bay Cardiology — internal',     '2026-04-13 08:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1091', 'a1000000-0000-0000-0000-000000000017', 'Heart failure management',                   'SF General — discharge','SF General — discharge',        '2026-04-21 08:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1092', 'a1000000-0000-0000-0000-000000000018', 'Arrhythmia evaluation',                      'Dr. Alvarez (PCP)',     'EHR feed',                      '2026-04-28 08:00:00-07', 'Mission Bay', 'normal', 'Booked',               null, null, null),
  ('REF-1070', 'a1000000-0000-0000-0000-000000000019', 'Arrhythmia eval',     'Dr. Chen',              'EHR feed', '2026-04-10 08:00:00-07', 'Mission Bay', 'urgent', 'In Progress', null, null, null),
  ('REF-1071', 'a1000000-0000-0000-0000-000000000020', 'Syncope workup',      'Dr. Alvarez (PCP)',     'EHR feed', '2026-04-11 09:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1072', 'a1000000-0000-0000-0000-000000000021', 'Valve follow-up',     'Dr. Osei (PCP)',        'EHR feed', '2026-04-12 10:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1073', 'a1000000-0000-0000-0000-000000000022', 'Chest pain eval',     'SF General — discharge','EHR feed', '2026-04-13 11:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1074', 'a1000000-0000-0000-0000-000000000023', 'Lipid management',    'Dr. Chen',              'EHR feed', '2026-04-14 12:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1075', 'a1000000-0000-0000-0000-000000000024', 'Pacemaker check',     'Dr. Alvarez (PCP)',     'EHR feed', '2026-04-10 08:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1076', 'a1000000-0000-0000-0000-000000000025', 'Cardiomyopathy f/u',  'Dr. Osei (PCP)',        'EHR feed', '2026-04-11 09:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1077', 'a1000000-0000-0000-0000-000000000026', 'Hypertension referral','SF General — discharge','EHR feed', '2026-04-12 10:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1078', 'a1000000-0000-0000-0000-000000000027', 'Palpitations',        'Dr. Chen',              'EHR feed', '2026-04-13 11:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null),
  ('REF-1079', 'a1000000-0000-0000-0000-000000000028', 'Stress test',         'Dr. Alvarez (PCP)',     'EHR feed', '2026-04-14 12:00:00-07', 'Mission Bay', 'normal', 'In Progress', null, null, null);


-- ── 4. Call attempts ──────────────────────────────────────────────────────────

insert into call_attempts (referral_id, attempted_at, channel, outcome, duration_secs, disclosure_played, summary, transcript) values

-- REF-1042 James Okafor
('REF-1042', '2026-04-14 09:02:00-07', 'voice', 'No Answer', 0, false,
 'No answer, no voicemail left.',
 '[]'),
('REF-1042', '2026-04-14 13:40:00-07', 'voice', 'Appointment Accepted', 204, true,
 'Patient reached; AI explained AFib follow-up and confirmed Medicare coverage to resolve cost concern. Accepted Tue Apr 22 2:15pm with Dr. Park.',
 '[{"who":"ai","text":"Hi, this is an automated assistant calling on behalf of Bay Cardiology. Is this James?"},{"who":"patient","text":"Yes, who is this again?"},{"who":"ai","text":"An AI assistant for Bay Cardiology. Dr. Chen referred you for an atrial fibrillation follow-up. Do you have a minute?"},{"who":"patient","text":"I guess. I wasn''t sure I really needed it, and I didn''t know what it''d cost."},{"who":"ai","text":"It''s a follow-up to check on your heart rhythm and medication. With Medicare this visit is typically fully covered. Would a weekday afternoon work?"},{"who":"patient","text":"Afternoons are better, yeah."},{"who":"ai","text":"I have Tuesday April 22nd at 2:15pm with Dr. Park. Shall I hold that for you?"},{"who":"patient","text":"That works."},{"who":"ai","text":"Great — our staff will confirm it and you''ll get a text shortly. Thank you, James."}]'),

-- REF-1039 Robert Klein
('REF-1039', '2026-04-14 08:30:00-07', 'voice', 'Appointment Accepted', 241, true,
 'Post-MI discharge referral. Patient anxious about returning so soon; AI reassured and secured Mon Apr 21 11:30am with Dr. Park.',
 '[{"who":"ai","text":"Hi, this is an automated assistant for Bay Cardiology. Am I speaking with Robert?"},{"who":"patient","text":"Yes."},{"who":"ai","text":"You were referred after your recent hospital stay for a heart attack follow-up. This one''s important to schedule soon. Is now an okay time?"},{"who":"patient","text":"It''s been a stressful couple weeks, honestly."},{"who":"ai","text":"That''s completely understandable. This visit is mostly a check-in to make sure your recovery is on track. Would a morning be easier for you?"},{"who":"patient","text":"Mornings, yes."},{"who":"ai","text":"I can hold Monday April 21st at 11:30am with Dr. Park."},{"who":"patient","text":"Okay, let''s do that."}]'),

-- REF-1063 Patricia Walsh
('REF-1063', '2026-04-22 09:18:00-07', 'voice', 'Appointment Accepted', 171, true,
 'Patient was hesitant about transportation; AI offered telehealth option, patient agreed in-person is fine and accepted Wed Apr 23 at 10:00am with Dr. Lin.',
 '[{"who":"ai","text":"Hi, this is an automated assistant calling on behalf of Bay Cardiology. Am I speaking with Patricia?"},{"who":"patient","text":"Yes, speaking."},{"who":"ai","text":"Dr. Park referred you for an atrial flutter evaluation with our EP team. Do you have a moment?"},{"who":"patient","text":"I do, but I''m not sure how I''d get there — I don''t drive anymore."},{"who":"ai","text":"I understand. We do offer telehealth appointments if that would be easier for you."},{"who":"patient","text":"Oh, I think I can arrange a ride. In-person is probably better for this kind of thing."},{"who":"ai","text":"That makes sense. I have Wednesday April 23rd at 10:00am with Dr. Lin available. Would that work?"},{"who":"patient","text":"Yes, that should be fine."},{"who":"ai","text":"Wonderful — our staff will confirm it shortly. Thank you, Patricia."}]'),

-- REF-1064 James Tan
('REF-1064', '2026-04-24 08:15:00-07', 'voice', 'No Answer', 0, false,
 'No answer; next attempt scheduled.',
 '[]'),
('REF-1064', '2026-04-24 13:10:00-07', 'voice', 'Appointment Accepted', 245, true,
 'Patient asked about parking; AI gave parking info. Patient accepted Fri Apr 25 at 3:30pm with Dr. Chen.',
 '[{"who":"ai","text":"Hi, this is an automated assistant calling on behalf of Bay Cardiology. Is this James Tan?"},{"who":"patient","text":"Yes, that''s me."},{"who":"ai","text":"Dr. Osei referred you for a statin management follow-up with our cardiology team. Do you have a minute?"},{"who":"patient","text":"Sure. Quick question — where do I park? Last time I had a hard time finding a spot."},{"who":"ai","text":"There''s a parking garage at 1500 Owens Street, and validated parking is available in the building''s lot on the ground floor."},{"who":"patient","text":"Good to know, thanks."},{"who":"ai","text":"I have Friday April 25th at 3:30pm with Dr. Chen available. Would that work for you?"},{"who":"patient","text":"That works for me."},{"who":"ai","text":"Great — our staff will confirm it and send you a reminder. Thank you, James."}]'),

-- REF-1051 Maria Delgado
('REF-1051', '2026-04-14 10:15:00-07', 'voice', 'Voicemail Left', 38, true,
 'Voicemail left (practice + callback only, no clinical detail). SMS fallback triggered in Spanish.',
 '[{"who":"ai","text":"Hello, this is a message from Bay Cardiology. Please call us back at your convenience. Thank you."}]'),
('REF-1051', '2026-04-14 10:16:00-07', 'sms', 'No Answer', 0, false,
 'SMS sent in Spanish with callback link. Awaiting response.',
 '[]'),

-- REF-1047 Walter Briggs
('REF-1047', '2026-04-14 09:46:00-07', 'voice', 'Escalated', 72, true,
 'ESCALATED: patient described chest pain currently. AI stopped scheduling, advised it could not give medical guidance, and flagged for immediate human callback.',
 '[{"who":"ai","text":"Hi, this is an automated assistant for Bay Cardiology calling about a referral from Dr. Chen."},{"who":"patient","text":"Okay — honestly I''ve been having some chest tightness right now."},{"who":"ai","text":"Thank you for telling me. I''m not able to give medical advice, and I''m going to have a member of the care team call you back right away. If this feels severe, please call 911."},{"who":"patient","text":"Alright."}]'),

-- REF-1033 Yuki Tanaka
('REF-1033', '2026-04-13 10:50:00-07', 'voice', 'Appointment Accepted', 168, true,
 'Patient accepted Thu Apr 17 9:00am with Dr. Lin. MA confirmed in practice system; mirrored to shadow calendar.',
 '[{"who":"ai","text":"Hi, this is an automated assistant for Bay Cardiology. Is this Yuki?"},{"who":"patient","text":"Speaking."},{"who":"ai","text":"Dr. Osei referred you for a palpitations workup. Can I help you find a time?"},{"who":"patient","text":"Sure, mornings are best."},{"who":"ai","text":"I can hold Thursday April 17th at 9:00am with Dr. Lin."},{"who":"patient","text":"Perfect."}]'),

-- REF-1086 Helena Brandt
('REF-1086', '2026-04-10 10:00:00-07', 'voice', 'Appointment Accepted', 135, true,
 'Patient accepted Mon Apr 14 9:30am with Dr. Park.',
 '[]'),

-- REF-1087 Linh Pham
('REF-1087', '2026-04-11 09:30:00-07', 'voice', 'Appointment Accepted', 190, true,
 'Patient accepted Tue Apr 15 10:00am with Dr. Lin.',
 '[]'),

-- REF-1088 Aisha Patel
('REF-1088', '2026-04-12 10:00:00-07', 'voice', 'Appointment Accepted', 170, true,
 'Patient accepted Tue Apr 15 2:00pm with Dr. Chen.',
 '[]'),

-- REF-1089 Beatriz Coelho
('REF-1089', '2026-04-12 14:00:00-07', 'voice', 'Appointment Accepted', 200, true,
 'Patient accepted Wed Apr 16 3:00pm with Dr. Park.',
 '[]'),

-- REF-1090 Sofia Reyes
('REF-1090', '2026-04-13 09:00:00-07', 'voice', 'Appointment Accepted', 150, true,
 'Patient accepted Fri Apr 18 10:00am with Dr. Lin.',
 '[]'),

-- REF-1091 Marcus Bell
('REF-1091', '2026-04-21 09:00:00-07', 'voice', 'Appointment Accepted', 225, true,
 'Patient accepted Mon Apr 28 11:00am with Dr. Chen.',
 '[]'),

-- REF-1092 David Kim
('REF-1092', '2026-04-28 09:00:00-07', 'voice', 'Appointment Accepted', 175, true,
 'Patient accepted Wed May 6 2:30pm with Dr. Park.',
 '[]'),

-- Generated In Progress referrals (REF-1070 to REF-1079)
('REF-1070', '2026-04-11 09:00:00-07', 'sms',   'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1071', '2026-04-12 09:00:00-07', 'voice', 'Voicemail Left', 31, true,  'Voicemail left; SMS fallback queued.',            '[]'),
('REF-1072', '2026-04-13 09:00:00-07', 'voice', 'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1073', '2026-04-14 09:00:00-07', 'sms',   'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1074', '2026-04-11 09:00:00-07', 'voice', 'Voicemail Left', 31, true,  'Voicemail left; SMS fallback queued.',            '[]'),
('REF-1075', '2026-04-12 09:00:00-07', 'voice', 'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1076', '2026-04-13 09:00:00-07', 'sms',   'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1077', '2026-04-14 09:00:00-07', 'voice', 'Voicemail Left', 31, true,  'Voicemail left; SMS fallback queued.',            '[]'),
('REF-1078', '2026-04-11 09:00:00-07', 'voice', 'No Answer',      0,  false, 'No answer; next attempt scheduled.',             '[]'),
('REF-1079', '2026-04-12 09:00:00-07', 'voice', 'Voicemail Left', 31, true,  'Voicemail left; SMS fallback queued.',            '[]');


-- ── 5. Appointments ───────────────────────────────────────────────────────────

insert into appointments (referral_id, status, day, time, provider, captured_at, confirmed_at, mirror_status) values
-- Pending Confirmation (captured, not yet confirmed)
('REF-1042', 'captured',  'Tue Apr 22', '2:15pm',  'Dr. Park', '2026-04-14 13:43:00-07', null, 'pending'),
('REF-1039', 'captured',  'Mon Apr 21', '11:30am', 'Dr. Park', '2026-04-14 08:34:00-07', null, 'pending'),
('REF-1063', 'captured',  'Wed Apr 23', '10:00am', 'Dr. Lin',  '2026-04-22 09:21:00-07', null, 'pending'),
('REF-1064', 'captured',  'Fri Apr 25', '3:30pm',  'Dr. Chen', '2026-04-24 13:14:00-07', null, 'pending'),
-- Booked (confirmed)
('REF-1033', 'confirmed', 'Thu Apr 17', '9:00am',  'Dr. Lin',  '2026-04-13 10:53:00-07', '2026-04-13 11:05:00-07', 'mirrored'),
('REF-1086', 'confirmed', 'Mon Apr 14', '9:30am',  'Dr. Park', '2026-04-10 10:03:00-07', '2026-04-11 14:00:00-07', 'mirrored'),
('REF-1087', 'confirmed', 'Tue Apr 15', '10:00am', 'Dr. Lin',  '2026-04-11 09:33:00-07', '2026-04-12 09:00:00-07', 'mirrored'),
('REF-1088', 'confirmed', 'Tue Apr 15', '2:00pm',  'Dr. Chen', '2026-04-12 10:03:00-07', '2026-04-12 15:30:00-07', 'mirrored'),
('REF-1089', 'confirmed', 'Wed Apr 16', '3:00pm',  'Dr. Park', '2026-04-12 14:03:00-07', '2026-04-13 10:00:00-07', 'mirrored'),
('REF-1090', 'confirmed', 'Fri Apr 18', '10:00am', 'Dr. Lin',  '2026-04-13 09:03:00-07', '2026-04-13 16:00:00-07', 'mirrored'),
('REF-1091', 'confirmed', 'Mon Apr 28', '11:00am', 'Dr. Chen', '2026-04-21 09:03:00-07', '2026-04-21 15:00:00-07', 'mirrored'),
('REF-1092', 'confirmed', 'Wed May 6',  '2:30pm',  'Dr. Park', '2026-04-28 09:03:00-07', '2026-04-28 16:00:00-07', 'mirrored');


-- ── 6. Audit log ──────────────────────────────────────────────────────────────

insert into audit_log (referral_id, created_at, user_id, what) values
('REF-1042', '2026-04-14 13:43:00-07', null,    'AI agent captured slot Tue Apr 22 2:15pm'),
('REF-1039', '2026-04-14 08:34:00-07', null,    'AI agent captured slot Mon Apr 21 11:30am'),
('REF-1063', '2026-04-22 09:21:00-07', null,    'AI agent captured slot Wed Apr 23 10:00am'),
('REF-1064', '2026-04-24 13:14:00-07', null,    'AI agent captured slot Fri Apr 25 3:30pm'),
('REF-1051', '2026-04-14 10:16:00-07', null,    'SMS fallback (es) sent'),
('REF-1047', '2026-04-14 09:48:00-07', null,    'Escalated — clinical (chest pain)'),
('REF-1033', '2026-04-13 10:53:00-07', null,    'AI agent captured slot Thu Apr 17 9:00am'),
('REF-1033', '2026-04-13 11:05:00-07', 'staff', 'Confirmed in practice system'),
('REF-1033', '2026-04-13 11:05:00-07', null,    'Mirrored to shadow calendar'),
('REF-1058', '2026-04-14 07:46:00-07', null,    'Ingested, validated, queued'),
('REF-1059', '2026-04-14 07:59:00-07', null,    'Ingested, urgent-triaged, queued'),
('REF-1061', '2026-04-14 06:41:00-07', null,    'Ingested, validated, queued'),
('REF-1062', '2026-04-14 08:06:00-07', null,    'Ingested, validated, queued'),
('REF-1086', '2026-04-10 10:03:00-07', null,    'AI agent captured slot Mon Apr 14 9:30am'),
('REF-1086', '2026-04-11 14:00:00-07', 'staff', 'Confirmed in practice system'),
('REF-1087', '2026-04-11 09:33:00-07', null,    'AI agent captured slot Tue Apr 15 10:00am'),
('REF-1087', '2026-04-12 09:00:00-07', 'staff', 'Confirmed in practice system'),
('REF-1088', '2026-04-12 10:03:00-07', null,    'AI agent captured slot Tue Apr 15 2:00pm'),
('REF-1088', '2026-04-12 15:30:00-07', 'staff', 'Confirmed in practice system'),
('REF-1089', '2026-04-12 14:03:00-07', null,    'AI agent captured slot Wed Apr 16 3:00pm'),
('REF-1089', '2026-04-13 10:00:00-07', 'staff', 'Confirmed in practice system'),
('REF-1090', '2026-04-13 09:03:00-07', null,    'AI agent captured slot Fri Apr 18 10:00am'),
('REF-1090', '2026-04-13 16:00:00-07', 'staff', 'Confirmed in practice system'),
('REF-1091', '2026-04-21 09:03:00-07', null,    'AI agent captured slot Mon Apr 28 11:00am'),
('REF-1091', '2026-04-21 15:00:00-07', 'staff', 'Confirmed in practice system'),
('REF-1092', '2026-04-28 09:03:00-07', null,    'AI agent captured slot Wed May 6 2:30pm'),
('REF-1092', '2026-04-28 16:00:00-07', 'staff', 'Confirmed in practice system');
