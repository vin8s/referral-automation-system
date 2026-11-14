# Vendor and BAA Tracker

> ## Golden rule
> **No real patient data goes into any service until its agreement (BAA) is signed and recorded below.**
> Fake data only until the soft launch.

> **Not legal advice.** Whether a BAA is required depends on whether [Clinic Name] is a HIPAA covered entity and how data flows. Have a lawyer confirm this list.

**Owner of this tracker:** [Owner name]   **Last updated:** [Date]

## Key terms

| Term | Plain meaning |
|---|---|
| **PHI** | Protected health information — anything that identifies a patient together with their health or care (name + referral, phone + appointment, etc.). |
| **BAA** | Business Associate Agreement — a contract where a vendor promises to protect PHI under HIPAA. |
| **AWS Artifact** | The AWS console page where the account owner accepts the AWS BAA online. |
| **HIPAA-eligible service** | An AWS service that AWS's BAA covers. Only use these for PHI. Check the current list on the AWS "HIPAA Eligible Services Reference" page. |

## Status key

`Not started` · `In progress` · `Signed` · `Not needed (confirmed)` · `Later`

## Pilot services (SMS pilot)

| Service | What it does | Touches PHI? | Agreement needed | How to get it | Status | Date signed | Notes |
|---|---|---|---|---|---|---|---|
| **Clinic ↔ Owner** | Owner builds and runs Relay for the clinic | Yes | BAA (if clinic is a covered entity) or volunteer confidentiality agreement | Clinic template, or lawyer-drafted. Signed by clinic director and owner. | Not started | | Must be signed before owner sees any real patient data. |
| **AWS account BAA** | Covers all HIPAA-eligible AWS services in the account | — | AWS BAA | Management account → **AWS Artifact** → Agreements → **Organization agreements** → AWS Organizations Business Associate Addendum. | **Signed (Active)** | 2026-11-13 | **AWS Organizations BAA**, accepted in management account 597631670754 (org Saajan-Patel-Team); verified Active from the Relay account **000755994402 (Relay-Clinic-Test)**. Covers every account in the organization. The single-account AWS BAA is also active on the management account. Covers only HIPAA-eligible services, used per AWS rules. |
| Amazon ECS on AWS Fargate + Elastic Load Balancing | Hosts the Relay website (container behind an HTTPS load balancer) | Yes (pages show patient data) | Covered by AWS BAA | — | Not started | | Both on the HIPAA-eligible list (checked 2026-11-13). See `docs/AWS_HIPAA_CHECKLIST.md` for every AWS service used. Amplify is **not** used. |
| Amazon SNS + SQS | Deliver inbound texts to Relay (and hold undeliverable ones) | Yes (message text) | Covered by AWS BAA | — | Not started | | Encrypted with the Relay KMS key. |
| Amazon RDS (Postgres) | Database: referrals, messages, appointments | Yes | Covered by AWS BAA | — | Not started | | Turn on encryption and automated backups. |
| Amazon Cognito | Staff login | Staff info only; low | Covered by AWS BAA | — | Not started | | Require MFA for all staff. |
| Amazon Bedrock (Claude) | AI that writes text replies | Yes (message content) | Covered by AWS BAA | — | Not started | | **Verify** Bedrock and the specific Claude model are eligible in the chosen region. |
| AWS End User Messaging (SMS) | Sends and receives texts | Yes (phone + message) | Covered by AWS BAA | — | Not started | | **Verify** eligibility. Texts travel over phone carriers; keep medical details out of texts. |
| AWS Secrets Manager | Stores passwords and keys | No (keys only) | Covered by AWS BAA | — | Not started | | |
| Amazon CloudWatch | Logs and alarms | Should be **No** | Covered by AWS BAA | — | Not started | | Code must keep patient data out of logs. |
| AWS Billing / Budgets | Cost alarms | No | None | — | Not needed | | Set alarms at $[50] and $[100]/month. |
| Amazon Route 53 | Domain name | No | None | — | Not needed | | |
| **SMS number registration** (toll-free verification or 10DLC) | Lets carriers deliver our texts | No (business info only) | None; registration form | AWS End User Messaging console | Not started | | Use the clinic's legal name. Takes days to weeks — start early. |
| **eClinicalWorks CSV export** | Appointment list uploaded to Relay | Yes | Clinic already has an agreement with eCW. Relay just receives a file. | — | Not started | | Download only on clinic computers; delete the file after upload. Sample export must be fake data. |

## Tools that must NOT receive PHI

| Tool | Rule |
|---|---|
| Email (personal or clinic, unless clinic confirms it's approved for PHI) | No patient names, phone numbers or details. Use referral IDs only. |
| Text messages / chat apps between staff (WhatsApp, Slack, etc.) | No PHI. |
| Public AI chat tools (ChatGPT, Claude.ai, Gemini, etc.) | **Never** paste patient data. Only fake data. |
| GitHub / code repositories | Fake data only. |
| Local development database (Postgres.app on owner's Mac) | Fake data only. |
| Supabase | Removed from the project. It only ever held fake data. Delete or pause the old project. |

## Later (not in the pilot)

Relay is SMS-only (2026-11-14): AI phone calls were removed, so no voice vendor (ElevenLabs, Twilio Voice, Amazon Connect) is needed. Twilio SMS test mode is for fake data only and is refused in production, so it needs no BAA.

| Service | What it does | Touches PHI? | Agreement needed | How to get it | Status | Date signed | Notes |
|---|---|---|---|---|---|---|---|
| eCW live interface (HL7 SIU feed or API) | Live appointment data from eCW | Yes | eCW interface agreement; possibly an interface vendor BAA | Through clinic's eCW account rep | Later | | Likely has a cost. |
| Compliance tools (Vanta, Drata) | Compliance tracking | Possibly | BAA if they store PHI | Vendor | Later | | Only if offering Relay to more clinics. |

## Before adding any new service

1. Will it see patient data? If yes, it needs a signed BAA (or a lawyer says it doesn't).
2. Add a row here **before** using it.
3. Get it signed and fill in the date.
4. Only then use real data.
