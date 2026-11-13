# Breach Response — If Patient Data May Be Exposed

> **Not legal advice — have a lawyer review.** HIPAA and [State] law have **breach notification rules with deadlines** (to patients, to the government, sometimes to media). Exact deadlines and who must be notified depend on the facts and on whether [Clinic Name] is a covered entity. **Call a lawyer early** — confirm the deadlines with them; don't guess.

**Keep this page where the owner and clinic director can find it fast.**

| Role | Name | Phone | Email |
|---|---|---|---|
| Relay owner | [Owner name] | [phone] | [email] |
| Clinic director | [Name] | [phone] | [email] |
| Privacy contact / officer | [Name] | [phone] | [email] |
| Lawyer | [Name / legal clinic] | [phone] | [email] |
| Cyber insurance (if any) | [Carrier, policy #] | [phone] | |
| AWS Support | Via AWS console → Support | — | — |

## What counts as "may be exposed"?

Examples — when in doubt, treat it as a possible breach:
- A text with patient information went to the **wrong phone number**.
- A Relay login was shared, stolen, or used by someone who shouldn't have it.
- A clinic laptop or phone with Relay access was lost or stolen.
- Patient data was put into email, a chat app, a screenshot, or an AI chat tool.
- The Relay website or database was reachable without logging in.
- Strange logins or activity in Relay or AWS.
- A printed Plan B list was lost.

## Steps

### 1. Contain (first hour)

| Do | Who |
|---|---|
| Stop the problem from getting worse: pause texting (`PLAN_B.md` section 3), disable the affected login, change passwords, lock or remotely wipe the device | Owner / admin |
| Don't delete evidence (logs, messages). Take notes instead. | Everyone |
| Don't contact patients or the public yet — wait for step 4 | Everyone |

### 2. Notify internally (same day)

| Do | Who |
|---|---|
| Staff tell the **owner** and **privacy contact** right away | Whoever noticed |
| Owner tells the **clinic director** the same day | Owner |
| If a vendor is involved (AWS, etc.), the owner contacts them | Owner |
| Contact the lawyer and (if any) cyber insurer | Clinic director / owner |

### 3. Document (start immediately, keep updating)

Fill in the incident log below. Write facts, not guesses.

### 4. Assess (with the lawyer)

| Question | Answer |
|---|---|
| What data was involved? (names, phones, referral type, message content, DOB…) | |
| How many patients? | |
| Who saw or could have seen it? | |
| Was it encrypted? | |
| Was it actually viewed or only exposed? | |
| Has it been retrieved or deleted? (e.g. wrong recipient confirmed deletion) | |
| Is this a reportable breach? Under which laws? | Lawyer decides |
| Notification deadlines (patients / HHS / state / media) | **Confirm with lawyer** |

### 5. Notify externally (only as advised by the lawyer)

Notification letters, regulator reports, and any media notices are handled by the clinic with the lawyer's guidance. Track dates below.

### 6. Fix and learn

- Fix the cause (code fix, process change, retraining).
- Review at the next weekly check-in. Update `SECURITY_POLICY.md` if needed.
- Keep all records for at least [6 years — **verify**].

## Incident log

| Field | Entry |
|---|---|
| Incident # | |
| Date/time discovered | |
| Discovered by | |
| What happened (facts) | |
| Date/time it likely started | |
| Data and number of patients involved | |
| Containment actions + time | |
| People notified internally + time | |
| Lawyer contacted (date) | |
| Breach determination (yes/no, by whom, date) | |
| External notifications (who, date) | |
| Root cause | |
| Fix / prevention | |
| Closed (date, by whom) | |
