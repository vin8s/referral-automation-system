# Staff Training — Relay (30 minutes)

**Trainer:** [Owner name]   **Attendees:** [MA name], [front desk names], [clinician name] (optional)
**When:** before the soft launch; repeat for every new staff member.
**Use fake patients only.** Never train with real patient data.

**Bring:** Relay open on a clinic computer (logged in with a training account), printed `STAFF_CHEAT_SHEET.md` for each person, a phone that can play a "fake patient", eCW training/test patient if available.

**Goal:** after 30 minutes, every attendee can (1) tell amber from red and act on each, (2) confirm a slot the right way (eCW first), and (3) fall back to Plan B.

---

## Outline

| Time | Section | What happens |
|---|---|---|
| 0:00–0:05 | **Why and what** | What Relay does and does not do |
| 0:05–0:12 | **Live demo** | Walk through one fake referral end to end |
| 0:12–0:17 | **Amber vs. red** | The two kinds of "needs attention" |
| 0:17–0:25 | **Practice scenarios** | Attendees drive; trainer watches |
| 0:25–0:28 | **Plan B and security** | What to do when it breaks; privacy rules |
| 0:28–0:30 | **5-question check** | Quick quiz; fix any wrong answers |

---

## 0:00–0:05 — Why and what

Key points to say:
- Many referred patients never book because one phone call didn't connect. Relay keeps trying by text.
- An **AI** sends and answers texts. It tells patients it is an automated assistant.
- **The AI never books.** It collects the time the patient wants. **You** book it in eCW and click Confirm.
- The AI never gives medical advice. Medical questions or emergencies go to a person.
- Patients can reply STOP at any time.

## 0:05–0:12 — Live demo (fake patient)

| Step | Trainer does | Point out |
|---|---|---|
| 1 | Log in with your own account and MFA code | Everyone has their own login. No sharing. |
| 2 | Open **Dashboard** | Today's counts at a glance |
| 3 | Open **Referrals**, pick a fake referral in **In Progress** | The text conversation on the referral page |
| 4 | On the fake patient phone, reply with a preferred time | Watch the referral move to amber **Pending Confirmation** |
| 5 | Open **Confirm queue** | Amber items wait here for you |
| 6 | Book it in eCW (test patient) — **first** | eCW is the real schedule |
| 7 | Click **Confirm** in Relay | Pill turns teal **Booked**; it appears on **Calendar** (read-only copy) |
| 8 | Open **Urgent alerts** | Where red **Escalated** items show up |

## 0:12–0:17 — Amber vs. red

| | AMBER | RED |
|---|---|---|
| Label | **Pending Confirmation** pill, or amber "needs a human" note | **Escalated** pill |
| Meaning | Waiting for a person; not a safety issue | **Safety only**: possible emergency or crisis; AI stopped all texting |
| Examples | Patient picked Tuesday 10am; "can I talk to a person?"; "this is the wrong number"; angry patient; a medical or cost question | "I have chest pain"; "I took too many pills"; "I want to hurt myself"; someone is in danger |
| Action | Picked a time: book in eCW → Confirm. Otherwise read the note and call the patient or fix the record; medical questions go to [clinician name]. | Read the conversation, call the patient now, tell [clinician name] right away |
| Speed | Same day | Right away |

Emergency rule: if a patient mentions an emergency, the AI tells them to call **911** (or **988** for a mental health crisis) and flags red. Staff still follow up and tell [clinician name].

## 0:17–0:25 — Practice scenarios

Each attendee does at least two. Use fake referrals prepared in advance.

| # | Scenario | Correct action |
|---|---|---|
| 1 | Amber item: patient picked Thursday 2pm, and it's open in eCW | Book in eCW, then Confirm in Relay |
| 2 | Amber item: patient picked Thursday 2pm, but eCW shows it's taken | Do **not** confirm. Return it so the AI offers other times, or call the patient |
| 3 | Red **Escalated**: patient texted "my chest hurts" | Read thread, call patient now, tell [clinician name], document, resolve |
| 4 | Amber "needs a human": "you have the wrong person" | Mark wrong number, fix number in eCW, don't text again |
| 5 | Patient calls the front desk: "Who keeps texting me?" | Explain it's the clinic; verify identity before discussing details |
| 6 | Patient texts in Spanish | Check the AI answered in Spanish; if anything is unclear, use the interpreter process |
| 7 | Relay won't load | Tell [Owner], switch to Plan B (phone calls) |

### Daily eCW schedule import (do it once together during practice)

Relay only knows what happens in eCW when staff upload the schedule. Practice with the fake file `relay-app/test/fixtures/ecw-appointments-sample.csv` (training environment only).

1. In eCW, run **[eCW report name]** for today + the next 14 days and export it as CSV/Excel. *(Which report to use is still being decided with the clinic — see open questions. Look under eCW **Reports** for an appointment list / appointment report that can be run for a date range and exported. It needs appointment date, time, patient name, DOB, and ideally Account No/MRN, provider and status.)*
2. Relay → **eCW import** → drop the file. Check the column dropdowns once and save the mapping.
3. Read the preview: **nothing changes until Apply**. Point out "Mark Booked", "Back to outreach", "Needs review".
4. Apply. Then handle the amber **Needs review** rows: pick the referral, or Ignore.
5. Show the amber **No show in eCW — call first** item: texting is paused until a person calls.

Ask: *"The dashboard says schedule data may be stale. What do you do?"* → Run the eCW report and import it now.

## 0:25–0:28 — Plan B and security

- Relay down → call patients like before. See `PLAN_B.md`. Tell [Owner name].
- Only [Owner/admin] pauses texting.
- Own login, MFA on, lock the screen when you walk away.
- No patient info in email, personal texts, screenshots or AI chat tools.
- Something looks wrong with patient data? Tell [Owner] and [privacy contact] the same day (`BREACH_RESPONSE.md`).

## 0:28–0:30 — 5-question check

| # | Question | Answer |
|---|---|---|
| 1 | A referral shows an amber **Pending Confirmation** pill. What do you do? | Book the time in eCW first, then click Confirm in Relay. |
| 2 | Which do you handle first, amber or red? | Red **Escalated** — right away. |
| 3 | A patient texts that they're thinking of hurting themselves. What happens? | AI tells them to call 988 (or 911) and flags red. Staff call the patient and tell the clinician right away. |
| 4 | Relay is down. How do you reach patients? | Call them by phone, as before (Plan B), and tell [Owner]. |
| 5 | Can you share your login with a coworker or paste a patient's text into ChatGPT? | No and no. |

Pass = 5/5 (review any misses on the spot).

**Sign-off:**

| Name | Role | Date trained | Score | Trainer initials |
|---|---|---|---|---|
| | | | /5 | |
| | | | /5 | |
| | | | /5 | |
