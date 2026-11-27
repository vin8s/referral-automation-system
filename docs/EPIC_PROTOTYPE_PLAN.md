# Epic sandbox prototype — plan and agreed decisions

Owner decisions of 2026-11-16. This is the authority for the Epic prototype work; scope rules are in
`CLAUDE.md` ("native booking: sandbox prototype only") and `docs/PRODUCT_SPEC.md` §2.

## Goal
One end-to-end demo against the **Epic FHIR sandbox** (synthetic data only):
**Sync from Epic → referral appears → patient texted → patient picks a time (from Epic `$find`) → MA clicks
Confirm → Relay books it in Epic (`$book`) and shows it on Relay's Calendar.**

## Agreed rules
1. **Human in the loop.** Patient picks by text → **MA clicks Confirm** → Relay books in Epic. The AI never books.
2. **Setting "Book into Epic (sandbox)"**, admin-only, **off by default**. Off = Relay behaves exactly as today
   (connector mode, built-in availability grid, Confirm only updates Relay).
3. **Sandbox only.** The Epic connector refuses any FHIR/token host other than `fhir.epic.com`.
   No real clinic, no real patient data, no production Epic.
4. **Simulated referral feed.** Epic has no referral-search API. An admin setting holds a list of Epic sandbox
   patient FHIR IDs (+ visit type). The **"Sync from Epic" button** (manual only, no timer) imports them as referrals.
5. **Confirm books in Epic AND creates the appointment on Relay's Calendar** (existing confirmed-appointment
   mirror), storing Epic's appointment ID.
6. **Reset demo button** clears Relay's own demo data so the trial can be re-run. Epic itself can't be reset
   (no FHIR cancel; Epic wipes the sandbox every Sunday ~8 pm CT); re-runs simply book a different slot.
7. Owner edits the demo phone number themselves (no test-phone override feature).
8. Secrets: the private key lives in `docs/private/` (git-ignored) locally / Secrets Manager when deployed.
   Never commit keys, tokens, AWS IDs or phone numbers.

## Epic sandbox facts (verified 2026-11-16)
- Token: `POST https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token` (client_credentials, private_key_jwt,
  RS384, `iss=sub=client_id`, `aud=token URL`, `exp` ≤ 5 min, unique `jti`). Token lasts 3600 s.
- R4 base `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`, STU3 base `.../api/FHIR/STU3`.
- `Patient.Read (R4)` works by FHIR ID (e.g. Camila Lopez `erXuFYUfucBZaryVksYEcMg3`, DOB 1987-09-12;
  Derrick Lin `eq081-VQEgP8drUUqCWzHfw3`, DOB 1973-06-03). Name search returned 0 for a backend app — use IDs.
- `Appointment.Search (R4)`: `?patient={id}&service-category=appointment[&date=ge…]`.
- `Appointment.$find (STU3)`: POST Parameters with `patient` (Patient resource incl. identifiers/name/DOB),
  `startTime`, `endTime`, **`service-type`** (docs say `serviceType`; server rejects it), optional `indications`.
  Visit type that works: system `urn:oid:1.2.840.114350.1.13.0.1.7.3.808267.11`, code `95014`. Returns ≤ 10
  proposed Appointments (paged); slots are held only briefly.
- `Appointment.$book (STU3)`: POST Parameters `patient` (valueIdentifier = patient FHIR ID), `appointment`
  (valueIdentifier = the $find Appointment id), `appointmentNote`. Returns the booked Appointment.
- No FHIR cancel/reschedule.

## Architecture (contract for all phases)
- `src/server/ehr/types.ts` — `EhrConnector` interface + plain data types (`EhrPatient`, `EhrAppointment`,
  `EhrSlot`). Screens never see FHIR.
- `src/server/ehr/epic/*` — Epic implementation (token cache, FHIR calls, FHIR→Relay mapping, sandbox-host guard).
- `src/server/ehr/fake.ts` — in-memory connector for tests and for running without Epic credentials.
- `src/server/ehr/index.ts` — `getEhrConnector()` (Epic when `EPIC_CLIENT_ID` is set, else fake) and
  `getEpicSettings()/saveEpicSettings()`.
- DB migration `007_epic.sql`: `epic_settings` (booking_enabled, patient list, last sync),
  `patients.epic_patient_id`, `appointments.epic_appointment_id`, `appointments.epic_slot_ref`.
- Components keep going through `src/lib/data.ts` → `/api/*` → `src/server/*` (the existing seam).

Env vars (`.env.local`, never committed): `EPIC_CLIENT_ID`, `EPIC_PRIVATE_KEY_PATH` (or `EPIC_PRIVATE_KEY` PEM),
`EPIC_KEY_ID`, optional `EPIC_TOKEN_URL`, `EPIC_FHIR_R4_BASE`, `EPIC_FHIR_STU3_BASE`.

## Phases and owners
| Phase | Work | Owner |
|---|---|---|
| Rules | CLAUDE.md + PRODUCT_SPEC + this plan | main chat |
| 1 | Epic connector module, migration 007, fake connector, tests | main chat |
| 0 | Stop seeding fake patients (`SEED_FAKE_DATA`), wipe command, empty states | Agent A |
| 5a | **Reset demo** button (admin) | Agent A |
| 2 | **Sync from Epic** button + patient-list setting + import as referrals | Agent B (after Phase 1) |
| 3 | SMS offers Epic `$find` slots when the setting is on; re-check before booking | main chat |
| 4 | Confirm → `$book` in Epic + Relay Calendar entry; slot-taken handling; audit | main chat |
| 5b | Demo script doc + extra tests | Agent C |
| 5c | End-to-end dry run with the owner's phone | main chat + owner |

Agents: local worktrees only (no cloud); fake data and the fake connector only — no Epic credentials or keys;
stay within the phase; run `npx vitest run` and `npx tsc --noEmit` before finishing.
