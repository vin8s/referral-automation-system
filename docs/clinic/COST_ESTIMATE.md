# Cost Estimate — Relay SMS Pilot

> **These are rough estimates, not quotes.** Prices change and depend on region, usage and plan. **Verify every line in the AWS Pricing Calculator (calculator.aws)** and with the actual vendors before sharing numbers as final. Legal and insurance ranges are guesses — get real quotes.

**Last updated:** [Date]   **Prepared by:** [Owner name]

## Summary

| | Estimate |
|---|---|
| **Monthly (AWS, pilot)** | about **$30–95 / month** — possibly covered by nonprofit/startup credits |
| **One-time (legal, LLC, setup)** | about **$0–2,500** depending on route (plus insurance if the clinic requires it) |

## Monthly costs (pilot: 20–50 patients, SMS only)

| Item | What it's for | Rough monthly | Notes / verify |
|---|---|---|---|
| Amazon RDS (Postgres) | Database | $15–45 | Smallest instance size + storage + backups. Usually the biggest line. Verify instance type and whether free tier applies. |
| AWS Amplify | Website hosting | $1–10 | Low traffic. |
| Amazon Cognito | Staff login | $0–5 | A handful of users; likely within free usage. Verify MFA/plan costs. |
| Amazon Bedrock (Claude) | AI replies | $2–15 | Pay per use (tokens). Small at pilot volume; depends on model chosen. |
| AWS End User Messaging (SMS) | Texts + phone number | $8–15 | Per-message fees plus carrier fees plus monthly number fee. Verify current rates for toll-free vs. 10DLC. |
| Secrets Manager, CloudWatch, misc. | Keys, logs, alarms | $2–5 | |
| **Total** | | **≈ $28–95** | Lines add to ~$28–95; matches `docs/CLINIC_LAUNCH_PLAN.md` estimate |

**Example SMS math (verify rates):** 50 patients × ~8 messages each (sent + received) = ~400 messages/month. At a few cents per message including carrier fees, that's roughly $5–15 including the number.

## One-time / yearly costs

| Item | Route A: clinic owns AWS | Route B: owner's LLC | Notes / verify |
|---|---|---|---|
| Legal review | $0 (law school clinic) – $1,000 | $0 – $1,500 | Free options: law school small-business/nonprofit clinics |
| LLC formation | — | $50–500 ([State] filing fee — verify) | Plus possible yearly state fee |
| EIN | — | $0 | Free at irs.gov |
| Cyber / liability insurance | Clinic's existing policy? | ~$500–1,500 / year (guess — get quotes) | Only if the clinic requires it. **Not included in the total below.** |
| SMS number registration | $0–$50 | $0–$50 | Some registration/vetting fees may apply — verify |
| Domain name (Route 53) | ~$15 / year | ~$15 / year | |
| **Total one-time** | **≈ $15–1,065** | **≈ $65–2,065** + insurance if required | Launch plan range: $0–2,500 |

## Ways to reduce cost

- **AWS Nonprofit Credits** (via TechSoup / AWS nonprofit program) if [Clinic Name] is a 501(c)(3) — verify eligibility and amount.
- **AWS startup credits** (e.g. AWS Activate) if using Route B — verify eligibility.
- AWS free tier for some services in the first 12 months — verify what applies.
- Free legal help from law school clinics.

## Cost safety

- **Billing alarms** at $[50] and $[100]/month, emailed to [owner] and [clinic contact].
- Owner reviews the AWS bill at each weekly check-in.
- Delete unused resources after testing.

## Later (not in pilot)

| Item | Rough cost | Notes |
|---|---|---|
| Voice calls (ElevenLabs + Twilio, or Amazon Connect) | Per-minute fees; could be $20–100+/mo at pilot volume | Needs BAAs; estimate when planned |
| eCW live interface (HL7/API) | Unknown — ask eCW rep; can be significant | |
| Compliance tools (Vanta/Drata) | Often thousands per year | Only if offering Relay to more clinics |

## Verified numbers (fill in after the AWS Pricing Calculator)

| Item | Verified monthly | Source / date |
|---|---|---|
| RDS | | |
| Amplify | | |
| Cognito | | |
| Bedrock | | |
| End User Messaging | | |
| Other | | |
| **Total** | | |

Calculator share link: ______________________
