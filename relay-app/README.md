# Relay app

Staff console for converting specialist referrals into booked appointments.
Next.js 16 (App Router) + Postgres. **Run it locally:** see
[`docs/LOCAL_DEV_SETUP.md`](../docs/LOCAL_DEV_SETUP.md) (`npm install && npm run dev`, no database install needed).

## How the pieces fit

```
Browser (client components)
  └─ src/lib/data.ts            the ONLY data seam: async functions → fetch('/api/...')
       └─ src/app/api/**/route.ts   route handlers: withAuth() → 401/403, input checks
            └─ src/server/*.ts      server-only repositories (SQL), audit writes
                 └─ src/server/db/  driver: pg (DATABASE_URL) or PGlite (dev)
src/proxy.ts                     first gate: signed-out pages → /login, /api/* → 401
src/app/(app)/layout.tsx         re-checks the session, renders the shell
```

| Path | What lives there |
|---|---|
| `db/migrations/NNN_name.sql` | Plain-SQL migrations, applied in order (`npm run db:migrate`; auto in dev) |
| `src/server/db/seed.ts` | Fake seed data, derived from `src/lib/mockData.ts` |
| `src/server/referrals.ts` | Referral/attempt/appointment/settings queries + audit log |
| `src/server/auth/` | Session cookie (jose), Cognito OIDC (openid-client), `withAuth`, `requireUser` |
| `src/server/config.ts` | Feature flags (`VOICE_ENABLED`) |
| `src/server/log.ts` | `logError()`: logs error class/code only, never patient data |
| `src/contexts/SessionContext.tsx` | `useSession()` → `{ user, isAdmin, voiceEnabled }` in client components |
| `src/server/sms/` | SMS texting pilot (see below) |
| `src/lib/slots.ts` | Shared slot availability grid + conflict keys (voice and SMS) |
| `test/` | `npm test` (vitest): SMS guards, scheduling, SNS verification, engine scenarios on in-memory Postgres |
| `.env.example` | Every environment variable, documented |

### Adding a feature (e.g. SMS, CSV import)

1. New table → add `db/migrations/002_<name>.sql` (never edit `001_init.sql`).
2. Queries → a new `src/server/<feature>.ts` (`import 'server-only'`), writing
   `audit_log` rows for every mutation with the acting user.
3. Endpoint → `src/app/api/<feature>/route.ts`, wrapped in `withAuth(...)`
   (`{ roles: ['admin'] }` for admin-only).
   Public webhooks (e.g. inbound SMS) must live under a path added to
   `PUBLIC_PATHS` in `src/proxy.ts` and verify the provider's signature themselves.
4. Screens call a new function in `src/lib/data.ts`, never `fetch` directly and never server code.

Rules: no patient data in `console.*`; fake data only until the BAA is signed;
roles are `ma` and `admin` (settings changes are admin-only).

## Staff login

Production uses **Amazon Cognito managed login** (Cognito's hosted, Relay-branded pages);
development uses a mock user picker. Managing accounts: [`docs/STAFF_LOGINS.md`](../docs/STAFF_LOGINS.md).

```
/login (Relay landing: states + "Sign in")
  └─ GET /api/auth/login?next=&lang=   PKCE verifier + state + nonce → signed HttpOnly cookie (15 min, path /api/auth)
       └─ Cognito /oauth2/authorize (prompt=login, lang=es optional)
            password · forced new password · authenticator-app setup · MFA code · forgot password
       └─ GET /api/auth/callback        ?error= → /login?error=…; else code exchange, verify ID token,
                                        groups → role (none → Cognito logout → /login?error=no_role)
            └─ relay_session cookie    HS256 JWT {sub,name,email,role,ats}; exp = min(now+idle, ats+absolute)
POST /api/auth/logout                  clears cookies → Cognito /logout → /login?signed_out=1
src/proxy.ts                           valid → re-sign on activity (pages / API writes, ≥60 s apart);
                                       expired → /login?reason=idle|absolute or 401 {code:'session_expired'}
```

| File | Role |
|---|---|
| `src/server/auth/config.ts` | `authMode()` (mock impossible in production), `SESSION_IDLE_MINUTES` (30), `SESSION_HOURS` (8) |
| `src/server/auth/session.ts` | sign / check / renew the session cookie (idle vs absolute expiry) |
| `src/server/auth/cognito.ts` | discovery, authorize URL, code exchange, group → role, logout URL |
| `src/server/auth/redirect.ts` | `safeNext()`: open-redirect-safe `next` |
| `src/server/auth/errors.ts` | Cognito / openid-client errors → login-page states |
| `src/app/login/` | landing page + English/Spanish copy |

The registered sign-out URLs (`<APP_URL>/login?signed_out=1`, `<APP_URL>/login?error=no_role`) must
match `LOGOUT_RETURN_PATHS` exactly; `infra/` registers both. Tests: `test/auth.test.ts`.

## SMS texting (pilot channel)

An AI texts the patient, verifies identity by date of birth (checked by code, never by the
model), offers 2–3 free slots and captures the one the patient picks. **Nothing books
itself:** the captured slot goes to the MA confirm queue (`Pending Confirmation`). Rules come
from `docs/AGENT_SAFETY_RULES.md`; the prompt and JSON contract from `docs/SMS_AGENT_PROMPT.md`.

| File (`src/server/sms/`) | Role |
|---|---|
| `engine.ts` | Per-turn flow: keywords → emergency backstop → opt-out/suppression → model → validation → precedence → outbound guard → quiet hours → persist |
| `outreach.ts` | `runOutreachTick()`: kill switch, quiet hours, cadence 0/2/5/9, caps, consent, minors, held-message release |
| `guards.ts` | Pure safety code: STOP/HELP/START (EN+ES), emergency phrases, model-output validation, outbound guard, precedence, DOB comparison |
| `schedule.ts` | Quiet hours (clinic time zone), cadence, caps, age |
| `provider.ts` | `SmsProvider`: `mock` (records only) / `aws` (End User Messaging `SendTextMessage`) — `SMS_PROVIDER` |
| `model.ts` | `SmsAgentModel`: `mock` rules / `bedrock` (Converse API, tool `sms_turn`, toolChoice auto) — `AI_PROVIDER` |
| `sns.ts` | SNS signature + host checks for `/api/sms/inbound` |
| `prompt.ts`, `templates.json` | Code copies of the doc prompt/schema and `docs/sms-templates.json` |
| `repo.ts`, `index.ts` | SQL (tables in `db/migrations/002_sms.sql`) and the route-facing service layer |

Endpoints: `GET/POST/PATCH /api/referrals/:id/sms`, `POST /api/referrals/:id/sms/simulate` (mock only),
`GET /api/sms/needs-human`, `POST /api/sms/needs-human/:id/resolve`, `GET/PUT /api/sms/settings` (PUT admin),
and two **public, self-authenticating** routes: `POST /api/sms/inbound` (SNS) and
`POST /api/sms/outreach/tick` (bearer `OUTREACH_CRON_TOKEN` or an admin session).

## eCW schedule import

For the pilot the clinic's eClinicalWorks schedule reaches Relay as an **appointment report export
(CSV or .xlsx)** that staff upload once or twice a day at `/schedule-import` (sidebar **eCW import**).
Connector mode: Relay only reads the file and updates its own mirror; **nothing is ever written to eCW.**
Staff routine: `docs/clinic/STAFF_CHEAT_SHEET.md`. Sample file (fake patients matching the seed):
`test/fixtures/ecw-appointments-sample.csv`.

Flow: upload → server parses (≤ 5 MB, ≤ 5,000 rows) → **draft** with auto-guessed column mapping (or a saved
profile whose headers all appear in the file) → **dry-run preview** per row → staff adjust dropdowns /
re-preview → **Apply** (one transaction) → SMS follow-ups after commit → review list for unclear rows.

| File | Role |
|---|---|
| `db/migrations/003_ecw_import.sql` | `patients.mrn`; `appointments.source / ecw_appt_key / visit_status`; `ecw_import_profiles`, `ecw_imports`, `ecw_appointments`, `ecw_busy_slots`, `ecw_import_review` |
| `src/lib/ecwImport.ts` | Mappable fields + labels, header auto-guess, required-field check, stale rule (pure, shared with the screen) |
| `src/server/import/parse.ts` | CSV (`csv-parse`) / .xlsx (`read-excel-file`) → header + string cells; skips title rows above the header |
| `src/server/import/normalize.ts` | Dates (MM/DD/YYYY, ISO, month names, Excel serials, 2-digit years), 12/24 h times, "Last, First" names, MRN/phone keys, eCW status codes → category, appointment identity |
| `src/server/import/plan.ts` | Matching tiers and the per-referral action rules (pure; what the preview shows is what Apply does) |
| `src/server/import/service.ts` | Drafts, preview, apply, review decisions, history, freshness — all SQL + audit rows |
| `src/server/import/index.ts` | Route-facing wrapper; runs SMS follow-ups after the commit |
| `src/app/api/schedule-import/**` | `GET/POST /api/schedule-import`, `GET/DELETE /:id`, `POST /:id/preview`, `POST /:id/apply`, `POST /review/:itemId`, `GET /status`, `GET /taken-slots` (all `withAuth`, MA + admin) |
| `src/app/(app)/schedule-import/page.tsx`, `src/components/screens/schedule-import/*` | Screen: upload, mapping, preview, history + review |
| `src/components/shared/ScheduleFreshnessBanner.tsx` | Amber "schedule data may be stale" strip (dashboard + confirm queue) |

**Matching** (never guesses): previously linked eCW appointment → exact MRN/Account No (a different DOB → review)
→ DOB + first/last name → DOB + phone. Several referrals at one tier → review (unless exactly one is booked at
that exact time). Partial signal (same DOB, different name; same name, different DOB; MRN mismatch) → review.
No signal → "not in Relay": counted, never stored, never turned into a referral.

**Actions** (one change per referral per file; eCW wall-clock times in `CLINIC_TIMEZONE`):

| eCW row | Relay referral | Apply does |
|---|---|---|
| Scheduled / Confirmed / Pending | not Booked | **Booked** ("Booked via eCW import by <user>"), confirmed appointment mirrored to the calendar, captured slot expired, held texts suppressed, moot amber items resolved; if it was Pending Confirmation the patient gets `booked_confirmation` (same rule as the MA's Confirm) |
| Scheduled, different time | Booked | mirrored appointment time updated |
| Scheduled, same time | Booked | nothing |
| Arrived / Checked In / Checked Out / Completed | any | visit recorded on the appointment (`visit_status`; there is no "completed" referral state); booked first if needed |
| Cancelled | Booked **at that time** | back to **In Progress**, appointment cancelled, texting cycle reset (identity re-check), `cancellation_reoffer` sent by `afterAppointmentCancelled()` (counts toward the lifetime cap of 6; held in quiet hours; amber `ecw_cancelled` if the cap is used up) |
| No Show | Booked at that time | back to In Progress + amber `ecw_no_show`, **texting paused** — staff call first |
| Rescheduled, no new time in the file | Booked at that time | back to In Progress + amber `ecw_rescheduled`, texting paused |
| Cancelled / No Show for an older time | — | nothing (never undoes a newer booking) |
| Any change for an **Escalated** referral, or an unknown status | — | review |

Idempotency: re-importing overlapping dates changes nothing twice (decisions compare against Relay's current
state; eCW appointments are keyed by appointment ID, else MRN + local date/time + provider; review items are not
duplicated and rows staff ignored stay ignored; a draft can be applied once).

**Taken times:** scheduled/arrived rows for the chosen providers (default: providers seeing referral patients in
the file) are stored in `ecw_busy_slots` **without patient identity** and replace the covered date range on each
import. `sms/repo.takenSlots()` (SMS agent) and `data.getBookedSlotKeys()` (voice) treat any grid time that
overlaps them (`SLOT_LENGTH_MIN` = 30) as taken.

**What is kept:** the raw file is never stored. Parsed cells live on the draft only until it is applied,
discarded or 24 h old. After apply: counts, date range, file name + SHA-256, matched appointments, review rows
(that row's mapped fields only) and anonymous busy times. Every mutation writes `audit_log` with the acting user;
no patient data is logged. `ECW_IMPORT_STALE_HOURS` (default 24) controls the stale warning.

## Production (AWS)

Deployed as a container on **ECS Fargate** behind an HTTPS load balancer, with a private RDS Postgres.
Infrastructure lives in [`../infra`](../infra) (AWS CDK); the beginner walkthrough is
[`docs/AWS_DEPLOYMENT_GUIDE.md`](../docs/AWS_DEPLOYMENT_GUIDE.md).

| File | Role |
|---|---|
| `next.config.ts` | `output: 'standalone'` (self-contained server for the image), security headers, `no-store` on `/api/*` |
| `Dockerfile` | Multi-stage build → small ARM64 image; bundles the RDS CA certificate and the migrations |
| `docker-entrypoint.sh` | Builds `DATABASE_URL` from `DB_*` vars, runs `node scripts/db.mjs migrate`, then `node server.js` |
| `src/app/manifest.ts`, `src/app/pwa/[file]/route.tsx` | Installable browser app (manifest + icons). No service worker, so nothing is cached offline |

`npm run build:db-cli` bundles `scripts/db.ts` into `dist-scripts/db.mjs` (used only by the Dockerfile).

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` ·
`npm run db:migrate` · `npm run db:seed` · `npm run db:reset`
