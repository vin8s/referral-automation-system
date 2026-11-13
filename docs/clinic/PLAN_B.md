# Plan B — When Relay, AWS or Texting Is Down

**Short version:** if Relay stops working, **go back to calling patients the way the clinic did before Relay.** Patient care never depends on Relay.

**Contacts**

| Who | Name | Phone | When to call |
|---|---|---|---|
| Relay owner | [Owner name] | [phone] | Anything broken, any time during clinic hours |
| Backup technical contact | [Name or "none"] | [phone] | Owner unreachable for 4+ hours |
| Clinic director | [Name] | [phone] | Outage longer than 1 day, or patients affected |
| Clinician | [Name] | [phone] | Any escalated or clinical concern |

---

## 1. What does "down" look like?

| Problem | What staff see | Who fixes it |
|---|---|---|
| Relay website down | Page won't load, error, or login fails | Owner |
| AWS outage | Same as above; owner can check the AWS Health Dashboard | AWS / owner |
| Texting broken | Relay loads but texts aren't sent or replies don't arrive; patients say "I texted back and nobody answered" | Owner |
| AI acting wrong | Odd, wrong or unsafe replies | Owner — **pause texting first** (section 3) |

## 2. Steps for staff

| # | Do this |
|---|---|
| 1 | Call [Owner name]. Say what you see and when it started. |
| 2 | **Switch to phone calls** for any patient who needs to schedule. Book in eCW as usual. |
| 3 | Use the **Plan B list** (section 4) to know who to call. |
| 4 | Write down each patient you called and the result on the paper log (section 5). |
| 5 | When Relay is back, the owner tells you. Then **confirm in Relay** any appointments you booked by phone, so Relay stops texting those patients. |

Do **not** text patients from personal phones.

## 3. How to pause all texting

Pause texting whenever the AI says something wrong or unsafe, a wrong group of patients is being texted, or the clinic asks.

| Who | How |
|---|---|
| **Admin (owner or [named admin])** | In Relay: **Settings → Outreach → Pause all texting** (switch). Confirm the banner shows "Texting paused." |
| **If Relay won't load** | Owner signs in to the AWS console and stops outbound SMS (for example, disable the sending number or the scheduled sending job). The AWS Deployment guide will list the exact steps. |
| **Staff (non-admin)** | Call the owner. If the owner can't be reached and texts are causing harm, call [Clinic director]. |

> **Owner to-do:** confirm the pause switch exists in Settings and write the exact AWS "emergency stop" steps here before soft launch: ______________________

After pausing: note the time, tell the clinic director, and don't un-pause until the owner and [clinician name] agree it's safe.

## 4. Finding who was mid-conversation

Patients who were in the middle of texting need a phone call so nobody falls through the cracks.

| Source | How |
|---|---|
| **Daily Plan B list (best)** | Each morning, the owner or MA exports/prints the list of referrals in **In Progress**, **Pending Confirmation** and **Escalated** (patient name, phone, referral type, state). Keep it in a locked drawer at [location]. Shred the old one each day. |
| Relay (if it still loads read-only) | **Referrals** screen, filter by state. |
| eCW | Referral list / pending referrals report — compare against booked appointments. |
| Owner (database) | If the website is down but the database is up, the owner can pull the list and give it to staff. |

**Call order:** Escalated first → Pending Confirmation → In Progress.

> **Owner to-do:** decide whether the daily printed list is acceptable to the clinic (it contains patient data — must be stored and shredded like other paper records). If not, rely on the eCW referral report.

## 5. Paper log during an outage

| Date/time | Patient (initials + DOB) | Referral type | Called by | Result (booked / left message / no answer / declined) | Entered in Relay after? |
|---|---|---|---|---|---|
| | | | | | ☐ |
| | | | | | ☐ |
| | | | | | ☐ |

Store with other patient paperwork. Shred when entered.

## 6. After the outage

1. Owner confirms Relay and texting work (send a test to a team phone).
2. Staff enter all phone bookings into Relay (Confirm) or mark outcomes.
3. Owner checks no patient got duplicate or late-night texts after restart.
4. Owner writes a 3-line note: what happened, how long, what changed. Share at the weekly check-in.
5. If patient data may have been exposed, follow `BREACH_RESPONSE.md`.
