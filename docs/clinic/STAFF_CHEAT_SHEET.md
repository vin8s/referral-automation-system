# Relay Cheat Sheet — [Clinic Name] Front Desk

**Relay website:** [https://relay-url]   **Help:** [Owner name] [phone]   **Backup MA:** [name]

**The AI texts patients. YOU book every appointment. The AI never books, and never gives medical advice.**

## Every working day (10 minutes, morning + after lunch)

| # | Do this | Where in Relay |
|---|---|---|
| 1 | Log in (your own login + MFA code). | — |
| 2 | Check **red Escalated** items first. | Confirm queue (top section) |
| 3 | Work the **amber** items: book each one. | Confirm queue |
| 4 | Glance at new referrals; make sure SMS consent is "Yes". | Referrals |
| 5 | Import the eCW schedule (morning, and again after lunch if you can). See below. | eCW import |
| 6 | Log out (or lock the screen) when you step away. | — |

## Daily eCW schedule import (5 minutes)

Relay can't see eCW by itself. This upload tells it what you booked, cancelled or no-showed in eCW, so it stops texting patients who are booked and offers new times to patients whose visit was cancelled. **Relay only reads the file — it never changes anything in eCW.**

1. In eCW, run **[eCW report name]** for **today through the next 14 days**. Export as **CSV** (or Excel .xlsx). Save it to the clinic computer, not a personal device.
2. In Relay, open **eCW import** and drop the file in.
3. **Match the columns** — the first time only: check each dropdown shows the right column (the grey "e.g." text helps). Tick **Save this column mapping**. Next time it's automatic.
4. **Read the preview.** Nothing has changed yet. Check the **Changes** tab: "Mark Booked", "Update time", "Back to outreach".
5. Click **Apply**.
6. **Needs review** rows (amber): pick the right referral or click **Ignore this row**. Relay never guesses when two referrals could match.
7. Delete the downloaded file from the computer.

| You see | What it means | What you do |
|---|---|---|
| Amber "**schedule data may be stale**" on the dashboard or confirm queue | No import for ~24 hours | Do the import now |
| Amber **No show in eCW — call first** | The patient missed the visit. Relay put the referral back in outreach but **won't text** until you've called. | Call the patient. If texting is OK, resume it on the referral page. |
| Amber **Rescheduled in eCW — check new time** | eCW says rescheduled but the new time wasn't in the file | Check eCW. If there's a new time, it will show up in the next import. |
| "Cancelled → back to outreach" | Relay texts the patient new times (within texting hours) | Nothing — watch the confirm queue |

**Can't find the report?** In eCW, look under **Reports** (or the Appointments / Resource Schedule screen) for an **appointment list / appointment report** you can run for a date range and **export to Excel/CSV**. It must have: appointment date, start time, patient name, date of birth, and ideally Account No/MRN, provider, and status. Ask **[eCW admin name]** to save it as a favorite so it's one click.

## Amber vs. red — they mean different things

| Color | What you see | What it means | What you do | How fast |
|---|---|---|---|---|
| **AMBER** | **Pending Confirmation** pill, or an amber "needs a human" note | Waiting for a person — not a safety issue. The patient picked a time, asked for a person, is upset, asked a medical or cost question, said "wrong number", or the AI got confused. | Picked a time: book it in eCW, then click **Confirm** in Relay. Anything else: read the note and conversation, then call the patient or fix the record. Medical questions go to **[clinician name]**. | Same day |
| **RED** | **Escalated** pill | **Safety only.** Possible medical emergency, overdose, danger/violence, or suicide/self-harm. The AI already told the patient to call 911 or 988 and stopped all texting. | Read the conversation. Call the patient now. Tell **[clinician name]** right away. Write a note, then resolve it. | **Right away** |

The other states: **Queued** (waiting for first text) · **In Progress** (AI is texting) · **Booked** (you confirmed it). No action needed for these.

## How to confirm a slot (always this order)

1. Open the item in the **Confirm queue**. Note the patient and the time they picked.
2. **Book it in eCW first.** Check the time is still open.
3. Go back to Relay and click **Confirm**. The pill turns teal **Booked**.
4. Time not available in eCW? Don't confirm. Reject/return it so the AI offers other times, or call the patient.

**Never click Confirm before the appointment exists in eCW.**

## A patient calls about a text

| They say | You do |
|---|---|
| "Who is this? / Is this real?" | "Yes, that's [Clinic Name]. We send texts to help schedule referral appointments." Verify identity the normal way before sharing details. |
| "I want to book" | Book in eCW, then find their referral in Relay and confirm. |
| "Stop texting me" | Tell them they can reply STOP, or mark them opted out in Relay. Record it in eCW. |
| A medical question or symptoms | Do not answer from the text. Transfer to **[clinician name]**. **Emergency? Tell them to call 911. Crisis? 988.** |
| "Wrong number" | Apologize. Mark wrong number in Relay. Fix the number in eCW. |
| Speaks a language you don't | Use the clinic's usual interpreter process. |

## If Relay is down

1. Tell **[Owner name]** at **[phone]**.
2. Go back to calling patients like before. See **PLAN_B.md** (binder at [location]).
3. To **stop all texting**: [Owner/admin] uses the pause switch in Settings. Staff can't fix AWS — just call.

**Never** put patient names or details in email, personal texts, screenshots or AI chat tools.
