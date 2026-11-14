# Connecting Relay to eClinicalWorks (eCW): options and step-by-step workflow

**Written:** 2026-11-14 · **For:** the Relay owner and the clinic's eCW admin (Rhode Island Free Clinic pilot, then other clinics)
**Status:** planning document. Option 1 is already built and works today. The others are for later.

---

## The short answer

| | |
|---|---|
| **Fastest option** | **Option 1: eCW report export → upload into Relay.** Already built. No eCW contract, no fees, no IT project. A clinic can start the same week. |
| **Best next step** | **Option 2: eCW emails the reports to Relay on a timer.** Removes the manual export. Needs one eCW report schedule and a small Relay feature. |
| **Long term** | **Option 3 (eCW FHIR API)** for reading data automatically, or **Option 4 (HL7 interface)** for a live feed. Both need eCW approval, setup time and possibly fees. |

Relay stays in **connector mode** in every option: Relay reads from eCW and helps patients pick a time; **a staff member books every appointment in eCW**. Relay never writes to the eCW calendar.

---

## What Relay needs from eCW (in every option)

| Data | Why | Where it comes from in eCW |
|---|---|---|
| **New referrals** (patient name, DOB, mobile, language, specialty, referring provider, SMS consent) | So Relay knows who to text | The outgoing referrals list or a referral report |
| **The appointment schedule** (patient, MRN, date/time, provider, status) | So Relay can mark referrals **Booked**, and restart outreach after a cancellation or no-show | The appointment report / scheduling report |
| **SMS consent** | Nobody is texted without it | Ideally a field in the patient record filled from the intake form; otherwise staff tick it in Relay |
| *(later)* **Open slots** | So the times Relay offers are real eCW openings | Only available through an API or interface (Options 3–4) |

---

## Option 1 — Report export and upload (FASTEST — use this for the pilot)

**What it is:** once or twice a day, a staff member exports two reports from eCW and drags them into Relay.

**Already built in Relay:**
- **Ingest referrals** page: spreadsheet upload (CSV or Excel) with flexible column matching ("DOB", "Cell", "Referred to", …), or one referral at a time.
- **eCW schedule import** page: upload the appointment report → match columns once (saved as a profile) → preview what will change → **Apply**. Re-uploading the same file is safe.
- **Pilot mode:** imported referrals wait in **Ready to text** on the Dashboard until staff approve them.

**Time to set up:** about 1 hour with the eCW admin · **Cost:** $0 · **eCW involvement:** none beyond running reports

### Step-by-step setup (one time)

1. **Meet the eCW admin (30 min).** Ask:
   - Which report lists **new outgoing referrals** (and can it filter to "created since yesterday")?
   - Which report lists **appointments** for the next 30 days, including cancellations and no-shows?
   - Can both be exported to **CSV or Excel**?
   - Is there a field where **SMS consent** is recorded? If not, can one be added (for example a structured "OK to text" field filled from the intake form)?
2. **Get a sample of each report with fake or fully redacted patients** (never real patient data before the BAA and go-live). Save them as test files.
3. **Referral report → Relay:** upload the sample on **Ingest referrals**. Check that name, DOB, mobile, language, specialty and consent were recognised. If a column was not recognised, note its exact header and add it to Relay's header list (`relay-app/src/app/(app)/ingest/page.tsx`, the header map at the top), or rename it in the eCW report.
4. **Appointment report → Relay:** upload the sample on **eCW schedule import**. Match the columns once and tick **save as profile** ("eCW appointment report"). Check the preview: booked, cancelled and no-show rows should match the right referrals.
5. **Write the daily routine into the staff cheat sheet** (`docs/clinic/STAFF_CHEAT_SHEET.md`): who does it, at what times, and what to do with rows Relay could not match.
6. **Dry run for one week** with fake patients, then go live.

### The MA's daily routine (about 10 minutes)

| When | Step | Where |
|---|---|---|
| Morning | 1. In eCW, run the **referral report** (new since yesterday) → export CSV | eCW |
| | 2. Drag it into **Ingest referrals** → **Import** | Relay |
| | 3. On the **Dashboard → Ready to text**, review the list → **Approve all ready** (fix or call anyone flagged amber) | Relay |
| Morning + after lunch | 4. In eCW, run the **appointment report** → export CSV | eCW |
| | 5. Drag it into **eCW schedule import** → check the preview → **Apply** | Relay |
| During the day | 6. Work the **Confirm queue**: book each picked time in eCW, then click **Confirm** in Relay | eCW + Relay |

**Limits:** someone must remember to export; Relay's view of eCW is only as fresh as the last upload; offered times come from Relay's own grid, so staff check them against eCW when booking (the Confirm queue already works this way).

---

## Option 2 — eCW sends the reports to Relay automatically (best next step)

**What it is:** the same two reports, but eCW's reporting tool sends them on a timer and Relay imports them by itself. The MA no longer exports anything; they only approve texts and work the Confirm queue.

**What we know:** eCW's reporting tool, **eClinicalWorks Business Optimizer (eBO)**, says reports "can be scheduled and delivered via email". Whether it can deliver CSV files to a secure folder (SFTP) is **not confirmed** — ask eCW.

**Time to set up:** about 1–2 weeks · **Cost:** low (AWS email receiving and storage; eBO may be a paid eCW add-on — check the clinic's license)

### Step-by-step

1. **Check the clinic has eBO** (or another eCW report scheduler) and ask eCW support:
   - Can a report be **scheduled** (e.g. 7:00 am and 12:30 pm) and delivered as a **CSV attachment** by email, or to **SFTP**?
   - Can the email be sent with **TLS encryption** (required: the reports contain patient information)?
2. **Build the Relay side** (one small feature; a Claude agent can do it):
   - *If email:* a private Relay inbox using **Amazon SES email receiving** (HIPAA-eligible, covered by the AWS BAA) → the attachment is saved to an encrypted **S3** bucket → Relay imports it automatically. Only accept mail from the clinic's eCW sender, and only CSV attachments.
   - *If SFTP:* an **AWS Transfer Family** SFTP folder (HIPAA-eligible) → S3 → Relay imports it automatically.
   - Reuse the saved column profiles from Option 1, so the import is identical to a manual upload.
   - Anything Relay cannot match goes to a "needs review" list, exactly like today.
3. **Schedule both reports in eCW** to the new address or folder.
4. **Run Options 1 and 2 side by side for a week** and compare results; then stop the manual uploads.
5. Update the cheat sheet: "Check the **last import** time on the eCW schedule import page each morning."

**Limits:** still a few hours behind eCW (it runs on a timer, not live); depends on eCW's report scheduler.

---

## Option 3 — eCW FHIR API (automatic reading, later)

**What it is:** Relay connects directly to eCW over its standard **FHIR API** and reads patients, referrals and appointments itself, with no files at all.

**What we know** (mostly from integration vendors' guides — confirm on eCW's developer portal):
- Backend apps such as Relay register on **eClinicalWorks Connect** (`fhir.eclinicalworks.com`); patient-facing apps register on the **healow developer portal**.
- Bulk data uses the FHIR **Group `$export`**: the practice defines a patient group (from its Registry) and enables it for the app; the app can then read data for those patients. Backend apps authenticate with a key pair (JWKS).
- Booking appointments **into** eCW goes through a separate **healow scheduling API** that needs its own approval. Relay does not need this: staff keep booking.
- eCW says it will give at least 30 days' notice of any API licensing or usage fees.

**Time to set up:** typically weeks to a few months (registration, clinic approval, testing) · **Cost:** none announced today (check before starting)

### Step-by-step

1. **Get the clinic's written OK** to connect Relay to their eCW (the practice must approve and enable the app).
2. **Register Relay** as a backend app on eClinicalWorks Connect; generate a key pair and register the public key (JWKS). Keep the private key in **AWS Secrets Manager**.
3. **Ask the eCW admin** to create the patient group (for example "patients with open referrals") and enable it for Relay.
4. **Build the Relay side:** a scheduled job (EventBridge, like outreach) that runs the bulk export, reads Patient / ServiceRequest (referrals) / Appointment, and feeds the same import code as Options 1–2.
5. **Test against eCW's sandbox**, then the clinic's live system in read-only mode with a few patients.
6. **Switch off the uploads** once a week of results matches.

**Limits:** what data is available (especially referrals and open slots) depends on the clinic's eCW version and setup; bulk exports are not instant.

---

## Option 4 — HL7 interface (live feed, most work)

**What it is:** eCW sends Relay a message the moment something changes: **SIU** messages for appointments (booked S12, rescheduled S13, cancelled S15) and **ADT** messages for patient details. This is the classic way practices connect outside systems to eCW.

**What we know:** the practice **orders the interface from eCW**, usually under a **statement of work (SOW)**. eCW's published cost disclosure says interfaces need an SOW and **may carry costs**; prices are not published. The feed usually lands in an **interface engine** (for example Mirth Connect) that passes it on.

**Time to set up:** typically 1–3 months · **Cost:** unknown until eCW quotes it (may be significant for a free clinic)

### Step-by-step

1. **Ask eCW for an SOW and price** for an outbound **SIU + ADT** interface to Relay (and whether outgoing referrals can be included).
2. **Decide if it's worth it** compared with Option 2 or 3 (it usually is only at higher volume or for several clinics).
3. **Set up the receiving end:** an interface engine on AWS (Mirth Connect on a small server, or AWS HealthLake / a managed HL7 service), inside the Relay AWS account and covered by the BAA. Network link to eCW as eCW requires (often a VPN).
4. **Map the messages** into Relay's existing import code (the same "book / reschedule / cancel / no-show" actions the CSV import already applies).
5. **Test with eCW's test feed**, then go live and retire the uploads.

**Limits:** cost, eCW scheduling time, and ongoing interface maintenance.

---

## Option 5 — healow Open Access booking link (different approach, consider later)

**What it is:** instead of staff booking, the text includes the clinic's **healow Open Access** link, so the patient books an eCW slot directly online (eCW's own online scheduling; patients can also use the portal or the healow app).

**Why it's not the plan now:** it changes the model (the patient books, not staff), Relay's safety rules currently forbid links in texts, and the clinic must have Open Access set up with the right visit types. It could suit routine visit types later; it would need clinic and clinician approval and a change to the texting rules.

---

## Comparison

| | 1. Export + upload | 2. Scheduled reports | 3. FHIR API | 4. HL7 interface | 5. healow link |
|---|---|---|---|---|---|
| **Ready** | **Today** | 1–2 weeks | Weeks–months | 1–3 months | Depends on clinic setup |
| **Cost** | $0 | Low | None announced | Quote from eCW | Clinic's healow license |
| **MA work per day** | ~10 min | ~2 min | ~2 min | ~2 min | Less booking |
| **How fresh** | Last upload | A few hours | A few hours | Minutes | Live |
| **eCW involvement** | None | Report schedule | App approval | SOW + build | Clinic setting |
| **Relay work** | Done | Small | Medium | Medium–large | Rule changes |

**Selected for the RIFC pilot: Option 1** (fastest, $0, already built). Plan **Option 2** after the pilot proves out, and revisit **3 or 4** only if more clinics or higher volume justify it.

---

## Questions to send the clinic's eCW admin now

1. Which reports list (a) new outgoing referrals and (b) appointments with status? Can both export to CSV?
2. Can you send sample exports with fake or redacted patients?
3. Where is SMS consent recorded in eCW today? Could the intake form's consent go into a structured field?
4. Does the clinic have **eBO** or another report scheduler? Can it email or SFTP a CSV on a schedule, with TLS?
5. *(Later)* Would the clinic approve a FHIR API connection? Would eCW quote an SIU/ADT interface?

---

## Sources

- eClinicalWorks — [Business Optimizer (eBO)](https://www.eclinicalworks.com/products-services/ebo/) (reports can be scheduled and delivered by email)
- eClinicalWorks — [healow Open Access](https://www.eclinicalworks.com/products-services/patient-engagement/open-access/) and [Certified EHR Technology](https://www.eclinicalworks.com/resources/certified-ehr-technology/)
- Integration vendor guides (not official eCW documentation; confirm details with eCW): [Nango — registering an eCW app](https://nango.dev/docs/api-integrations/eclinicalworks/how-to-register-your-own-eclinicalworks-app), [Medblocks — eCW integration guide](https://medblocks.com/docs/patient-access/ecw), [Nirmitee — eCW FHIR/HL7/API guide](https://nirmitee.io/blog/eclinicalworks-integration-fhir-hl7-api-guide), [Nirmitee — eCW scheduling API](https://nirmitee.io/blog/eclinicalworks-appointment-scheduling-api/), [Open Dental — eCW HL7](https://opendental.com/Manual/hl7ecw.html), [Stacksync — eCW integrations](https://www.stacksync.com/blog/eclinicalworks-integrations-guide)

Related: `docs/CLINIC_LAUNCH_PLAN.md` (pilot checklist), `docs/clinic/CLINIC_QUESTIONS.md` (Section D), `docs/clinic/STAFF_CHEAT_SHEET.md` (daily routine), `docs/clinic/COST_ESTIMATE.md`.
