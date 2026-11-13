# First Meeting — Questions for the Clinic Director

**Meeting:** Relay SMS pilot kickoff
**With:** [Clinic director name], [Clinic Name]
**Owner:** [Your name]
**Date:** [Date]  **Length:** about 60 minutes

> **Not legal advice.** Some questions below have legal consequences (HIPAA status, agreements, ownership). Write down the answers, then have a lawyer review the plan. Free options: a law school small-business or nonprofit legal clinic.

---

## Agenda

| Time | Topic |
|---|---|
| 0–10 min | What Relay is (2-minute demo with fake data) and what the pilot would look like |
| 10–25 min | Legal and ownership (Section A) |
| 25–35 min | Money and credits (Section B) |
| 35–45 min | People, languages and eCW (Sections C and D) |
| 45–55 min | Pilot scope and baseline (Section E) |
| 55–60 min | Next steps, owners and dates |

**What to bring:** laptop with Relay demo (fake data), printed copy of this list, `COST_ESTIMATE.md`, draft `PATIENT_CONSENT.md`.

**One-sentence pitch:** "Relay texts referred patients to help them pick an appointment time. A person on your staff books every appointment in eCW and confirms it. The AI never books on its own and never gives medical advice."

---

## A. Legal and ownership

| # | Question | Why it matters | Answer |
|---|---|---|---|
| A1 | **Is the clinic a HIPAA covered entity?** (Do you bill any insurance electronically — Medicaid, Medicare, private?) | If yes, HIPAA rules apply and the clinic likely needs a Business Associate Agreement (BAA) with whoever handles patient data for it. If no, state privacy law and good practice still apply. A lawyer should confirm. | |
| A2 | **Who will own the AWS account — the clinic (with me as a volunteer), or my own LLC?** | The account owner signs the AWS BAA and is responsible for the data. Clinic ownership (Route A) is simpler and avoids forming an LLC. | |
| A3 | Do you require me to have an LLC, or to carry insurance (general liability, cyber, professional)? | Decides whether Route B costs (LLC fees, insurance) apply. | |
| A4 | Do you have a **BAA template** or a **volunteer confidentiality agreement** template? | Saves legal cost. We need one signed before any real patient data is used. | |
| A5 | Who is your privacy officer or privacy contact? | Needed for the breach response plan and security policy. | |
| A6 | Does your intake form already ask permission to text patients? Can we add wording? | Texting patients usually needs documented consent. Draft wording is in `PATIENT_CONSENT.md`. | |
| A7 | Who must approve patient-facing text messages and AI-disclosure wording? (Name a clinician.) | A clinician must approve scripts before real patients. | |
| A8 | Any clinic or board policies on AI tools or texting patients? | We must follow them. | |

## B. Money and credits

| # | Question | Why it matters | Answer |
|---|---|---|---|
| B1 | Is the clinic a 501(c)(3) nonprofit? | Needed for nonprofit cloud credits and discounts. | |
| B2 | Are you registered with **TechSoup**? Have you applied for AWS nonprofit credits? | Credits may cover most or all AWS costs during the pilot. Eligibility and amounts must be verified. | |
| B3 | Who pays AWS bills if credits run out? What monthly limit is OK? | Sets billing alarm levels (for example $50 and $100/month). | |
| B4 | Who in the clinic can sign up for accounts or be on billing emails? | Account ownership and billing alerts. | |

## C. People and roles

| # | Question | Why it matters | Answer |
|---|---|---|---|
| C1 | Who is the **decision-maker** for the pilot? | Approves go/no-go. | |
| C2 | Which **clinician** will review scripts and transcripts? | Required sign-off before real patients. | |
| C3 | Which **MA(s) / front desk staff** will use Relay daily? | They get logins and training. | |
| C4 | Who is the **eCW admin** (or eCW support contact)? | Needed for appointment exports. | |
| C5 | Who is the backup if the main MA is out? | Someone must check Relay every working day. | |
| C6 | Which computers will staff use? Are any shared at the front desk? | Affects login and device rules in `SECURITY_POLICY.md`. | |

## D. Patients, languages and eCW

| # | Question | Why it matters | Answer |
|---|---|---|---|
| D1 | **Which languages do patients need?** (Spanish? Others?) | Texts and consent are drafted in English and Spanish. Other languages need separate review. | |
| D2 | Roughly what share of patients have a cell phone that can text? | Tells us how many patients SMS can reach. | |
| D3 | Can the eCW admin produce a **sample appointment export (CSV) using fake or fully redacted patients**? | Needed to build the CSV import. **Must contain no real patient data.** | |
| D4 | Which eCW report or screen shows upcoming appointments? Who can run it, and how often? | The pilot uses CSV uploads instead of a live eCW connection. | |
| D5 | How do referrals arrive today (fax, eCW, email, paper)? | Decides how referrals get into Relay. | |
| D6 | What clinic hours should texts be sent in? Any days to avoid? | Sets quiet hours. | |
| D7 | What phone number should patients call with questions? | Goes in texts and in the HELP reply. | |

## E. Pilot scope and baseline

| # | Question | Why it matters | Answer |
|---|---|---|---|
| E1 | Which **one referral type** should the pilot start with? | Keeps the pilot small. | |
| E2 | Pilot size: **20–50 patients over 4–6 weeks** — OK? | Agrees scope. | |
| E3 | **Today, what % of referrals are booked within 14 days?** (Baseline.) How do you know? | Without a baseline we can't tell if Relay helped. | |
| E4 | How do staff contact referred patients today? How many attempts? | Baseline for effort saved. | |
| E5 | What result would make the pilot a success for you? (Suggested: booked-within-14-days rate goes up by [X] points, with zero safety incidents.) | Agrees the success metric up front. | |
| E6 | What would make you stop the pilot early? | Agrees the stop rules. | |
| E7 | Best day/time for a 15-minute weekly check-in? | Pilot rhythm. | |

---

## After the meeting

| Action | Owner | Due |
|---|---|---|
| Send a summary of answers to the director | [Owner] | [Date] |
| Update `VENDOR_BAA_TRACKER.md` with agreement decisions | [Owner] | [Date] |
| Book legal review | [Owner] | [Date] |
| Send consent wording to clinician for approval | [Owner] | [Date] |
| Receive sample eCW export (fake data) | [eCW admin] | [Date] |
| Start SMS number registration (takes days to weeks) | [Owner] | [Date] |
