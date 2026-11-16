# Epic sandbox demo: step-by-step script

Use this script to run and present the end-to-end Relay + Epic demo on your Mac at
<http://localhost:3000>. It is written for you to present to a clinic or partner.

**What the audience sees:** a referral comes in from Epic. Relay texts the patient. The patient
confirms their date of birth and picks a time that Epic offered. A medical assistant (MA) clicks
**Confirm**. Relay then books that time in Epic and shows it on Relay's Calendar.

> Everything here is **synthetic test data in Epic's public sandbox**. Never use a real clinic,
> a real patient or production Epic. Relay refuses any Epic address other than `fhir.epic.com`.
> Background and the rules: `docs/EPIC_PROTOTYPE_PLAN.md`.

Labels in **bold** are the exact words on screen.

---

## 1. Before the day (one-time setup)

### 1.1 Relay runs on your Mac
Follow `docs/LOCAL_DEV_SETUP.md` steps 1–4 (`npm install`, then `npm run dev`, then open
<http://localhost:3000>).

### 1.2 Epic sandbox settings in `relay-app/.env.local`
These come from your app on fhir.epic.com (**Build Apps**). Put them in `relay-app/.env.local`
(git-ignored). **Never paste the values into a document, chat, slide or commit.**

| Name | What it is |
|---|---|
| `EPIC_CLIENT_ID` | Your app's **Non-Production Client ID**. If this is blank, Relay uses a built-in **fake EHR**, not Epic. |
| `EPIC_KEY_ID` | The `kid` of your key in the app's JWK Set. |
| `EPIC_PRIVATE_KEY_PATH` | Path to the private key file, which stays in `docs/private/` (git-ignored). |
| `EPIC_PRIVATE_KEY` | Optional. The key text itself, used instead of the path. |
| `EPIC_TOKEN_URL`, `EPIC_FHIR_R4_BASE`, `EPIC_FHIR_STU3_BASE` | Optional overrides. Leave them blank. |

Restart `npm run dev` after you change `.env.local`.

**Check:** sign in as **Alex Rivera** (admin) and open **Settings**. The **Epic sandbox (prototype)**
card should say **Connected to Epic sandbox**. If it says **Using the built-in fake EHR (no Epic
credentials set)**, Relay can't see `EPIC_CLIENT_ID`.

### 1.3 Clinic time zone
Texts show times in the clinic's time zone, `CLINIC_TIMEZONE` in `.env.local`. The default is
`America/New_York`. Set it to the time zone you want the audience to see, for example
`America/Chicago`.

### 1.4 Decide how the patient's texts will work
You can run the demo in one of two ways.

**A. Simulated texting (easiest, nothing leaves your Mac).**
Leave `SMS_PROVIDER` blank (this means `mock`). Relay saves every text in its database and shows
it on the referral. Each referral then has a **Patient simulator (prototype)** box where you type
replies as the patient. The AI is either:
- the built-in rule-based stand-in (`AI_PROVIDER` blank), with no sign-in needed, or
- Claude on Amazon Bedrock (`AI_PROVIDER=bedrock` plus `BEDROCK_MODEL_ID`). Before the demo, sign
  in to AWS in Terminal with `aws login --profile relay`, and make sure the server runs with
  `AWS_PROFILE=relay` and `AWS_REGION` set to your selected Region.

**B. Real texts to your own phone.**
This needs the AWS texting setup and your verified phone. The phone-test kit does the wiring for
you. Stop `npm run dev` first, then from `relay-app/` run:

```bash
scripts/phone-test/phone-test.sh up
```

This starts Relay on port 3000 with AWS texting and Bedrock. It still reads your Epic settings from
`.env.local`. The server is locked so it can **only** text your phone (`SMS_ALLOWED_NUMBERS`), so
other patients are never texted. Use only `up` (and `status` / `down`). **Don't use `send`**: it
creates a separate non-Epic test patient. When you finish, run `phone-test.sh down`.

With either option, **you put your own phone number on the test patient yourself** (step 3.4).
Relay has no "test phone" override.

### 1.5 Texting hours
Relay only sends texts inside the clinic's sending window. The default is **Monday–Saturday,
8 am–8 pm clinic time**, and never on Sundays (**Settings → Texting → Quiet hours**). Outside the
window, texts (including replies to the patient) are held until it opens. **Hold the demo inside
the window.** The phone-test kit (option B) lifts this limit for your own phone only.

---

## 2. Start from an empty app

Use either one of these:

- **In the app:** as **Alex Rivera**, go to **Settings → Demo data → Reset demo**, type `RESET`
  and click **Reset demo**. This deletes every referral, patient, appointment, text and log. It
  keeps settings, including the Epic card. The page reloads.
- **In Terminal:** stop Relay (Ctrl+C), run `npm run db:reset-empty` in `relay-app/`, then run
  `npm run dev` again. Always stop Relay first, because the built-in database can only be opened
  by one program at a time.

Make sure `SEED_FAKE_DATA` is blank or `false`, so the fake demo patients aren't loaded.

---

## 3. The demo, step by step

Sign in as **Alex Rivera** (admin) for setup. You can switch to **Priya Anand** (MA) for the
Confirm step to show the MA's view.

### 3.1 Settings → Epic sandbox card: add the test patients
1. Open **Settings** and scroll to **Epic sandbox (prototype)**.
2. Under **Simulated referral feed**, click **Camila Lopez (sandbox)** and, if you want a second
   patient, **Derrick Lin (sandbox)**. Each click adds a row:
   - Camila Lopez: `erXuFYUfucBZaryVksYEcMg3`, DOB **09/12/1987**
   - Derrick Lin: `eq081-VQEgP8drUUqCWzHfw3`, DOB **06/03/1973**

   Keep **Visit type code** set to `95014` (the default). **Specialty** is optional, for example
   "Family Medicine". It is the only clinical word that appears in the texts.
3. Click **Save patient list**.

*Talk track:* "Epic has no API to list referrals, so for the demo we simulate the referral feed
with a list of Epic test patients."

> With real texts (option B), add **only Camila**. Your phone goes on one patient at a time.

### 3.2 Turn on "Book into Epic (sandbox)"
On the same card, click the **Book into Epic (sandbox)** button so it reads **On**. You'll see the
message **Booking into Epic (sandbox) is on.**

While it is **Off**, Relay works exactly as it normally does: it uses its own appointment times,
and Confirm only updates Relay.

### 3.3 Sync from Epic
Click **Sync from Epic**. A summary appears, for example
**2 imported · 0 updated · 0 already in Relay · 0 errors**, followed by
`Camila Maria Lopez → REF-1043`.

- Syncing **never sends a text**.
- A patient who already has an open referral is not added twice (**already in Relay**).

*Talk track:* "That was a real Epic API call. Relay just read Camila's record (name, date of birth,
phone, language) from the Epic sandbox."

### 3.4 Put your phone on the patient (real texts only)
1. Open **Referrals**, then open Camila's referral.
2. Click **Edit info**, change **Phone** to your own verified mobile, and click **Save changes**.

Do this **before** the first text goes out. Changing the phone resets the identity check on
purpose. You don't need this step for simulated texting.

### 3.5 Approve the first text (if pilot mode is on)
Pilot mode (**Settings → Texting → New referrals → Staff approval before the first text (pilot
mode)**) is **On** by default.

1. Open **Dashboard**. The **Ready to text** card lists the new referral.
2. Tick Camila and click **Approve selected (1)**, or click **Approve all ready (N)**.

Relay sends the first text right away if you're inside the sending window.

If pilot mode is **Off**, Relay doesn't send immediately after a sync. Automatic outreach sends the
first text within about 5 minutes (`OUTREACH_AUTORUN_SECONDS`, default 300). For a live demo,
leave pilot mode **On** so the text goes out when you click.

### 3.6 The patient conversation
Open Camila's referral. The **Text messages** card shows the thread.

1. **First text:** Relay introduces the clinic and asks the patient to confirm their date of
   birth. No medical details are in the text.
2. **Patient verifies their DOB:** reply `09/12/1987`.
   - Simulated: in **Patient simulator (prototype)**, click the date-of-birth chip or type it, then
     click **Send as patient**.
   - Real: text it back from your phone.
3. **Relay offers times:** up to 3 times on different days, in clinic time, for example
   "Tue, Nov 17 at 9:00 AM". These come from **Epic's live schedule** (`$find`) for the next 14
   days.
4. **Patient picks:** reply `1`, `2` or `3`. Relay answers that it noted the time, that it is
   **not booked yet**, and that a staff member will confirm it. The referral moves
   to **Pending Confirmation**, and the slot appears in the **Confirm queue**.

*Talk track:* "The AI never books anything. It only collects the patient's choice. A person
approves every booking."

### 3.7 Confirm queue → book in Epic
1. Open **Confirm queue** (sidebar). You can sign in as **Priya Anand** first to show the MA's view.
2. Camila's card carries the **Epic sandbox · prototype** tag. Its main button reads
   **Confirm — book in Epic (sandbox)**.
3. Click it. The button shows **Booking in Epic…** and the card then leaves the queue.

Relay books the slot in Epic first (`$book`). Only after Epic accepts does Relay mark it
**Booked**, add it to the Calendar and text the patient the booking confirmation.

### 3.8 Show the result
- **Referral:** Camila's referral is now **Booked**.
- **Calendar:** open **Calendar**. The page opens on a fixed prototype week (April 2026), so type
  "Camila" in **Find patient or date…** and pick the result to jump to the appointment. The event
  line reads `<provider> · <time> · Epic`. Open it to see
  **Confirmed · booked in Epic sandbox (prototype)** and the note that edits here change Relay only.
- **Texts:** the patient received the booking confirmation.
- **Audit:** the referral's history shows "Booked in Epic sandbox (appointment …) … confirmed by MA
  (prototype)".

*Talk track:* "That appointment now exists in Epic's sandbox. Relay stored Epic's appointment ID."

---

## 4. If something goes wrong during the demo

**"That time is no longer open in Epic. The patient will be offered new times by text."**
Someone else (or an earlier run) took the slot in Epic, or Epic released the hold. Nothing was
booked. Relay released the slot, put the referral back to **In Progress**, and texted the patient
new times from Epic, without the taken time. Say: *"This is the safety net. Relay re-checks with
Epic at the moment of booking and never double-books."* Have the patient pick again, then Confirm
again.

**"Could not book in Epic: … Nothing was changed; try again."**
Epic didn't answer, or refused the booking. The card stays in the queue and nothing changed in
Relay. Wait a moment and click Confirm again. If Epic is down, say: *"If Epic is unreachable,
Relay changes nothing. The MA simply retries."*

**Epic was down when the times were offered.**
Relay doesn't invent times. It offers none and puts an amber **No offered time works** item in the
Confirm queue for staff to follow up.

---

## 5. Running it again

1. **Settings → Demo data → Reset demo** (type `RESET`). The Epic card keeps your patient list and
   the On/Off setting.
2. **Sync from Epic** again. Both patients come back as new referrals.
3. With real texts, **put your phone on the patient again** (step 3.4), because the reset deleted
   the patient record.
4. Run the conversation again. **Each run books a different slot.** Epic has no cancel or
   reschedule API, so every booking from earlier runs stays in the sandbox, and Epic stops
   offering those times.
5. Epic wipes its sandbox about **every Sunday at 8 pm Central** (per Epic's sandbox notes in
   `docs/EPIC_PROTOTYPE_PLAN.md`; not verified here). Bookings from earlier runs disappear then.

---

## 6. Short talk track: what is real and what is simulated

| Part | Real or simulated |
|---|---|
| Patient record read from Epic | **Real** Epic API call, to the **sandbox**, with **synthetic** patients. |
| Times offered to the patient | **Real** Epic `$find` results from the sandbox schedule. |
| Booking | **Real** Epic `$book` call in the sandbox, made only after an MA clicks Confirm. |
| Referral feed | **Simulated.** Epic has no referral-search API, so an admin lists sandbox patient IDs and clicks **Sync from Epic**. |
| Text messages | Simulated in the app (option A) or real texts to the presenter's own phone (option B). Never to a real patient. |
| Who books | **A human, every time.** The AI only collects the patient's choice. "Book into Epic (sandbox)" is off by default; when it is off, Relay works in its normal connector mode. |

One-liner: *"Relay does the outreach and scheduling conversation; a person approves; Relay writes
the booking into the EHR. Today that's Epic's sandbox with test data."*

---

## 7. Troubleshooting

| What you see | Why | What to do |
|---|---|---|
| Sync error mentioning **invalid_client** | Epic doesn't recognise the app yet. New or edited sandbox apps can take **up to 1 hour** to sync at Epic. | Wait, then sync again. Also check `EPIC_CLIENT_ID`, `EPIC_KEY_ID` and the app's JWK Set URL. |
| Error with **403** (or 401) and "…can take up to 30 minutes to sync…" | An API you just added to the Epic app hasn't reached the sandbox yet. | Wait up to **30 minutes** and retry. |
| Epic card shows **Using the built-in fake EHR** | `EPIC_CLIENT_ID` is blank or Relay wasn't restarted. | Fix `.env.local` and restart. |
| Epic card shows an error instead of loading | Epic settings incomplete (for example missing `EPIC_KEY_ID` or the key file). | Check the `EPIC_*` names in `.env.local` and restart. |
| Sync says **Epic has no phone number for this patient** | Relay can't text a patient without a number, so it doesn't import them. | Use a sandbox patient that has a phone in Epic (Camila or Derrick). |
| Texting with Bedrock fails, or an amber **AI error — nothing sent** appears; the server log shows AccessDenied or credentials errors | Your AWS sign-in expired. | Run `aws login --profile relay` and retry. Restart the server if it still fails. |
| **No texts go out** | Outside the sending window (Mon–Sat 8–8 clinic time), **or** pilot mode is on and the referral wasn't approved in **Ready to text**, **or** **Pause all texting** is on, **or** texting is paused on that referral. | Check the time; approve on the **Dashboard**; check **Settings → Texting** for **Resume texting**; check the referral's **Text messages** card. |
| Real texts: nothing arrives | The patient's phone isn't your verified number, or the phone-test tunnel expired. | Re-check the phone on the referral (step 3.4); rerun `scripts/phone-test/phone-test.sh up`. |
| Card says **Confirm — booked in practice system** (no Epic tag) | **Book into Epic (sandbox)** is Off, or the time didn't come from Epic. | Turn it On before the patient is offered times. A slot captured while it was Off books in Relay only. |
| Booked appointment not visible on the Calendar | The Calendar opens on April 2026 and the week grid shows 8 am–5 pm rows. | Use **Find patient or date…** to jump to it. |

---

### Notes on what was verified for this script

Checked against the code on branch `epic-prototype` (commit 1428d2b): every screen label and button
named above, the routes (`/dashboard`, `/action` = Confirm queue, `/referrals`, `/calendar`,
`/settings`), the error messages in section 4 and the table, the 14-day search window, up to 3
offered times, the pilot-mode default (On), the sending-window default, and that sync sends no text.

**Not verified** (no Epic credentials were used to write this):
- What phone number, if any, each sandbox patient has in Epic, and the exact times and time zone
  of Epic's sandbox schedule.
- The exact wording of the first text and the booking confirmation (they come from
  `docs/SMS_TEMPLATES.md`, and the AI may word replies differently when `AI_PROVIDER=bedrock`).
- The Sunday ~8 pm CT sandbox reset (taken from `docs/EPIC_PROTOTYPE_PLAN.md`).
- The exact AWS error text when the Bedrock sign-in has expired.
