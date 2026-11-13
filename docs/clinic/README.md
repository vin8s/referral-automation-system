# Clinic Documents — Index

These documents help **[Clinic Name]** run the Relay SMS pilot safely. They are written for clinic staff and the project owner, not for programmers.

Relay is a staff website. It texts referred patients (with an AI texting agent) to help them pick an appointment time. **A medical assistant (MA) books every appointment in eClinicalWorks (eCW) and then confirms it in Relay.** The AI never books anything by itself.

> **Fill-in fields:** anything in `[square brackets]` must be replaced with real names, numbers or dates before use.
>
> **Legal note:** documents marked "Not legal advice" are drafts. Have a lawyer review them before relying on them.

## The documents

| Document | What it is | Who it's for | When it's used |
|---|---|---|---|
| [CLINIC_QUESTIONS.md](./CLINIC_QUESTIONS.md) | Meeting agenda and question list for the first meeting | Owner + clinic director | Phase 0, before anything else |
| [VENDOR_BAA_TRACKER.md](./VENDOR_BAA_TRACKER.md) | Every service that may touch patient data, and the agreement each one needs | Owner + clinic director | Phase 1–2; check before any real patient data is used |
| [PATIENT_CONSENT.md](./PATIENT_CONSENT.md) | Intake-form texting consent (English/Spanish), front-desk script, how to record consent | Front desk, clinician reviewer | Before soft launch; then every new patient |
| [STAFF_CHEAT_SHEET.md](./STAFF_CHEAT_SHEET.md) | One printable page: daily routine, amber vs. red, how to confirm | MA / front desk | Every day — print it and keep it at the desk |
| [STAFF_TRAINING.md](./STAFF_TRAINING.md) | 30-minute training outline with practice and a 5-question check | Owner (trainer), MA, front desk | Phase 8, before soft launch; again for new staff |
| [PLAN_B.md](./PLAN_B.md) | What to do if Relay, AWS or texting is down; how to pause all texting | MA, front desk, owner | Whenever something breaks |
| [SECURITY_POLICY.md](./SECURITY_POLICY.md) | Short security rules for a tiny team | Everyone with a Relay login | Sign at onboarding; review yearly |
| [BREACH_RESPONSE.md](./BREACH_RESPONSE.md) | Step-by-step if patient data may have been exposed | Owner, clinic director, privacy contact | Immediately if something goes wrong |
| [PILOT_PLAN.md](./PILOT_PLAN.md) | Pilot scope, timeline, metrics, weekly check-in, go/no-go checklist | Owner + clinic director | Planning, soft launch, weekly, end of pilot |
| [COST_ESTIMATE.md](./COST_ESTIMATE.md) | Rough monthly and one-time costs | Owner + clinic director | Before deciding; update after the AWS Pricing Calculator |

## Related documents (outside this folder)

| Document | What it covers |
|---|---|
| `docs/CLINIC_LAUNCH_PLAN.md` | The full launch plan (phases, agents, timeline) |
| `docs/REFERRAL_STATUSES.md` | Exact names and colors of referral states |
| `docs/AGENT_SAFETY_RULES.md` | What the AI texting agent must and must not do (emergencies, medical questions, escalation) |
| `docs/SMS_AGENT_PROMPT.md` | The instructions given to the AI texting agent |
| `docs/SMS_TEMPLATES.md` | The standard text messages patients receive |
| `docs/CONVERSATION_TEST_CASES.md` | The test conversations that must pass before real patients |

## The golden rule

**No real patient data goes into any service until its agreement (BAA) is signed.** Use fake data only until the soft launch. See [VENDOR_BAA_TRACKER.md](./VENDOR_BAA_TRACKER.md).
