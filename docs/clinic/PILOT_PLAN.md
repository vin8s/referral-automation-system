# Relay SMS Pilot Plan — [Clinic Name]

**Version:** draft   **Last updated:** [Date]

## 1. Scope

| Item | Pilot setting |
|---|---|
| Channel | **SMS only** (no AI phone calls) |
| Referral type | [One referral type, e.g. "dermatology"] |
| Patients | **20–50** referred patients who gave SMS consent |
| Length | **4–6 weeks** after soft launch |
| Languages | English and Spanish |
| Booking | AI collects preferred time → **MA books in eCW → MA confirms in Relay** |
| eCW data | CSV appointment export uploaded [daily / twice a week] |
| Text hours | [e.g. Mon–Fri, 9am–6pm] — no texts outside these hours |
| Out of scope | Voice calls, live eCW feed, AI writing to the eCW calendar, other referral types |

## 2. Roles

| Role | Name | Responsibilities |
|---|---|---|
| Decision-maker | [Clinic director] | Go/no-go, stop the pilot if needed |
| Owner | [Owner name] | Runs Relay and AWS, reads conversations, fixes scripts, reports weekly |
| Clinician reviewer | [Name] | Approves scripts and consent wording; reviews transcripts and escalations |
| MA / front desk | [Names] | Daily confirm queue and escalations; books in eCW |
| eCW admin | [Name] | Appointment exports |
| Privacy contact | [Name] | Incidents |

## 3. Timeline

| Week | What |
|---|---|
| 1–2 | Clinic meeting (`CLINIC_QUESTIONS.md`); start SMS number registration |
| 2–5 | Legal / agreements; AWS account and BAA |
| 5–7 | Deploy to AWS |
| 7–9 | Testing with fake patients (`docs/CONVERSATION_TEST_CASES.md`); clinician sign-off |
| 10 | Training (`STAFF_TRAINING.md`); go/no-go; **soft launch with 5–10 patients** |
| 11–12 | Expand to full pilot group if soft launch goes well |
| 12–16 | Run pilot; weekly check-ins |
| End | End-of-pilot review |

Dates are rough; SMS registration and legal review can add weeks.

## 4. Success metrics (vs. baseline)

| Metric | Baseline (today) | Pilot target | How measured |
|---|---|---|---|
| % of referrals booked within 14 days | [__%] (from clinic) | [baseline + __ points] | Relay Analytics + eCW |
| Median days from referral to booked | [__] | Lower | Relay |
| % of texted patients who reply | — | [__%] | Relay |
| **Safety incidents** (unsafe AI reply, missed emergency) | — | **0** | Transcript review |
| Escalations handled same day | — | 100% | Relay |
| Opt-out rate (STOP) | — | Track; investigate if > [10%] | Relay |
| Staff time per booking | [__ min] (estimate) | Lower | Staff estimate |
| AWS cost per month | — | Under $[__] | AWS billing |

## 5. Go / no-go checklist (before ANY real patient)

All must be checked. The decision-maker signs.

- [ ] Clinic ↔ owner agreement (BAA or confidentiality) **signed**
- [ ] AWS BAA accepted in AWS Artifact; `VENDOR_BAA_TRACKER.md` up to date
- [ ] Only HIPAA-eligible AWS services hold patient data
- [ ] Lawyer reviewed consent wording and plan
- [ ] Clinician **approved** the SMS scripts, templates and AI disclosure (`docs/SMS_AGENT_PROMPT.md`, `docs/SMS_TEMPLATES.md`)
- [ ] Clinician approved `docs/AGENT_SAFETY_RULES.md` (emergency → 911/988 + red Escalated)
- [ ] All `docs/CONVERSATION_TEST_CASES.md` **passed** with fake patients (incl. emergency, STOP, Spanish, wrong number)
- [ ] Consent wording on the intake form; consent recorded for each pilot patient
- [ ] SMS number registration approved; production access granted (out of sandbox)
- [ ] STOP and HELP work (tested)
- [ ] Quiet hours and message limits set
- [ ] Staff **trained** and passed the 5-question check; cheat sheet at the desk
- [ ] Every staff **login works** with MFA; nothing in Relay is public without login
- [ ] Pause-all-texting tested
- [ ] Plan B agreed with staff
- [ ] **Billing alarms** set (e.g. $50 and $100)
- [ ] Backups on and one restore tested
- [ ] Security policy signed by every user

**Decision:** ☐ Go ☐ No-go   **Signed:** ______________ (decision-maker)   **Date:** ________

## 6. Soft launch (5–10 patients)

| Step | What |
|---|---|
| 1 | Pick 5–10 consenting patients, ideally simple cases, including at least 1 Spanish speaker. |
| 2 | Add them to Relay. Owner watches the first texts go out. |
| 3 | **Owner reads every conversation** the same day. |
| 4 | MA works the confirm queue and escalations daily. |
| 5 | After 1 week (or all 5–10 done): owner, clinician and MA review. Fix scripts. |
| 6 | Decide: expand to full pilot, repeat soft launch, or stop. |

**Stop the pilot immediately (pause texting) if:** an unsafe AI reply, a text to the wrong person, a missed emergency, or the clinic asks.

## 7. Weekly check-in (15 minutes)

| Min | Item |
|---|---|
| 0–3 | Numbers: patients texted, replies, booked, escalated, opt-outs, AWS cost |
| 3–7 | Problems: any escalations, odd AI replies, staff pain points |
| 7–10 | Conversation review: 2–3 examples (use referral IDs, not names, in notes) |
| 10–13 | Changes: script fixes, settings, process |
| 13–15 | Decisions and action items |

## 8. End-of-pilot review questions

1. Did booked-within-14-days beat the baseline? By how much?
2. Were there any safety incidents? Were escalations handled on time?
3. What did patients say? Opt-out rate? Complaints?
4. How much staff time did it save or cost?
5. What did it cost per month and per booked patient?
6. Did Spanish-speaking patients do as well as English-speaking patients?
7. Did staff trust it? What would they change?
8. Next step: **continue**, **expand** to more referral types, **add voice calls**, **add a live eCW feed**, or **stop**?
9. If continuing: are agreements, budget and ownership right for the long term?
