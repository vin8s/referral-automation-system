# healow "Register Scheduling App" — form answers for Relay

For the healow developer portal (connect4.healow.com → **Register Scheduling App**).
The app name and description appear in the healow app gallery and on the practice's consent screen.

## Logo

| File | Use |
|---|---|
| **`relay-logo-256.jpg`** (256×256, 12 KB) | **Upload this one** (form limit: PNG or JPEG, max 20 KB) |
| `relay-logo-160.png` (160×160, 17.7 KB) | Backup if a PNG is required |
| `relay-logo-512.png`, `relay-logo.svg` | Originals (too large for the form) |

Design: Relay teal (`#0d9488`, the app's accent color) with a calendar + check mark (scheduling) and a chat bubble (text messaging).

## App name

**Relay**
(If a longer name is allowed: **Relay — Referral Scheduling Assistant**)

## Short description (about 160 characters)

> Relay helps clinics turn referrals into booked appointments. Patients pick a time by text message, and clinic staff review and confirm every booking.

## Full description

> Relay is a referral scheduling assistant for clinics. When a provider refers a patient, Relay texts the patient (with their consent) to help them choose an appointment time. It shows the patient real open times from the clinic's eClinicalWorks schedule. Clinic staff review each request and confirm the booking with one click; Relay then books, reschedules or cancels the appointment in eClinicalWorks and sends the patient a confirmation text.
>
> Relay only uses the minimum information needed to schedule: the patient's name, date of birth and mobile number, and the provider, location and time of the appointment. Patients verify their identity by date of birth before any appointment details are shared, and can reply STOP at any time. Relay does not keep copies of the open appointment times it reads from eClinicalWorks; it checks them live before each booking. All data is encrypted and hosted on HIPAA-eligible AWS services under a Business Associate Agreement.

## Other questions on the form

| Question | Answer | Why |
|---|---|---|
| Will the app query **Patient** resources? | **Yes** | To match the referred patient to their eCW record before booking. |
| Will the app query **Encounter** resources? | **No** | Not needed for scheduling. |
| Scheduling actions used | Search schedules and open slots; book, update (reschedule) and cancel appointments; retrieve appointment details | The six operations in the healow Scheduling API Specification. |
| Who uses it | Clinic staff (bookings are staff-approved); patients interact only by text message | |

## Before submitting

- Make sure the description matches what Relay actually does at the time you submit. Today Relay does **not** yet book into eCW (staff book manually); the description above describes the planned healow integration. If you register before it is built, say it is "in development" or adjust the wording.
- The hosting sentence assumes Relay is deployed on AWS (the deployment guide's plan); today it runs on a local computer for testing.
- Have a public **privacy policy** URL ready; healow and eCW review data handling before production.
- Read the Scheduling API Terms of Service (pricing in Exhibit B, BAA in Exhibit A, no caching of API data) before accepting.
