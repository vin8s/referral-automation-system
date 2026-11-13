# Relay Cheat Sheet — [Clinic Name] Front Desk

**Relay website:** [https://relay-url]   **Help:** [Owner name] [phone]   **Backup MA:** [name]

**The AI texts patients. YOU book every appointment. The AI never books, and never gives medical advice.**

## Every working day (10 minutes, morning + after lunch)

| # | Do this | Where in Relay |
|---|---|---|
| 1 | Log in (your own login + MFA code). | — |
| 2 | Check **red Escalated** items first. | Urgent alerts |
| 3 | Work the **amber** items: book each one. | Confirm queue |
| 4 | Glance at new referrals; make sure SMS consent is "Yes". | Referrals |
| 5 | Upload the eCW appointment export, if it's your day. | Ingest |
| 6 | Log out (or lock the screen) when you step away. | — |

## Amber vs. red — they mean different things

| Color | What you see | What it means | What you do | How fast |
|---|---|---|---|---|
| **AMBER** | **Pending Confirmation** pill, or an amber "needs a human" note | The patient picked a time, or asked for a person. Nothing is wrong — it's waiting for you. | Book it in eCW, then click **Confirm** in Relay. If they asked for a person, call them. | Same day |
| **RED** | **Escalated** pill | The AI stopped. A human is needed: patient upset, a medical question, possible emergency, wrong number, or bad data. | Read the conversation. Call the patient. If it sounds like an emergency or a clinical issue, tell **[clinician name]** right away. Write a note, then resolve it. | **Right away** |

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
