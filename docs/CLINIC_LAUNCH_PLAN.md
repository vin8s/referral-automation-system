# Relay — Clinic Launch Plan (AWS)

Everything left to take Relay from prototype to a live **SMS pilot** at the free clinic.

> **Tip:** press **Cmd+Shift+V** in VS Code to view this file formatted.
> To mark progress, change ⬜ to ✅ in the **Status** column.

**Who does what**

| Icon | Meaning |
|---|---|
| 🧑 | **You**: people, money, signatures |
| 🤖 | **Claude agent**: code and documents |
| 🤝 | **Together** |

---

## Decisions already made

| Topic | Decision | Why |
|---|---|---|
| **Cloud** | Everything on **AWS** | One free, self-serve BAA (AWS Artifact) covers hosting, database, AI and texting |
| **Channel** | **SMS only** | Cheaper, simpler, no call-recording laws. As of 2026-11-14 voice outreach was removed from Relay entirely. |
| **eCW schedule** | **CSV export** upload | Works in days with no eCW contract. HL7 live feed comes later. |
| **How staff use it** | **Hosted website** with login, installable as a browser app | Replies and reminders need an always-on server anyway |
| **Stack** | ECS Fargate + load balancer (hosting) · private RDS Postgres (database) · Cognito (login) · Bedrock/Claude (AI) · End User Messaging + SNS (SMS) · EventBridge Scheduler (outreach timer) · all built from `infra/` (AWS CDK) | All HIPAA-eligible under the AWS BAA. **Not Amplify**: Amplify supports Next.js only up to v15 and can't reach a private database. See `docs/AWS_DEPLOYMENT_GUIDE.md` |
| **Supabase** | **Removed from the project entirely**, including development | One platform (AWS), one BAA, no second system to maintain |
| **Development setup** | **No install needed**: `npm run dev` uses a built-in Postgres (PGlite) with fake data and a mock login. Optional local Postgres via `DATABASE_URL`. Production uses AWS RDS + Cognito. See `docs/LOCAL_DEV_SETUP.md` | Coding doesn't wait for the AWS account. RDS is also Postgres, so switching is one setting (`DATABASE_URL`). |

**Golden rule:** no real patient data goes into any service until its BAA is signed. **Fake data only** until the soft launch.

**Estimated cost:** about **$65–75/month** on AWS for the pilot (see `docs/clinic/COST_ESTIMATE.md`), possibly covered by credits, plus **$0–2,500 one-time** for legal and LLC costs. These are rough estimates, not quotes.

---

## Part 1: Getting Relay into the clinic

### Phase 0: Clinic conversations 🧑
Start here; everything else depends on these answers.

| Status | Task | Notes |
|---|---|---|
| ⬜ | Meet the clinic director and agree on a small pilot | One referral type, 20–50 patients, 4–6 weeks |
| ⬜ | Ask: **"Are you a HIPAA covered entity?"** | Do they bill insurance electronically? |
| ⬜ | Ask: **"Will the clinic own the AWS account, with me as a volunteer?"** | Alternative: you form your own LLC |
| ⬜ | Ask: "Do you require an LLC or insurance?" | |
| ⬜ | Ask: "Do you have a BAA or volunteer confidentiality template?" | |
| ⬜ | Ask: "Which languages do patients need?" | Probably Spanish |
| ⬜ | Ask: "Can you get nonprofit credits?" | AWS Nonprofit Credits / TechSoup |
| ⬜ | Identify the people involved | Decision-maker, clinician script reviewer, MA/front desk, eCW admin |
| ⬜ | Get a **sample eCW appointment export** | Fake or redacted patients; needed for the CSV import |
| ⬜ | Get the clinic's **baseline** | % of referrals booked within 14 days today |
| ⬜ | Add SMS consent wording to the intake form | The Clinic Docs agent drafts it |

### Phase 1: Legal and ownership 🧑

| Status | Task | Notes |
|---|---|---|
| ⬜ | Choose a route: **A) clinic owns everything** or **B) your own LLC** | A is simpler and needs no LLC |
| ⬜ | Get a legal check | Law school small-business/nonprofit clinics are free |
| ⬜ | Route B only: form an LLC, get an EIN, consider cyber insurance | EIN is free at irs.gov |
| ⬜ | Sign an agreement with the clinic | BAA if they're a covered entity; otherwise a volunteer/confidentiality agreement |
| ⬜ | Clinician approves the consent and AI-disclosure wording | |

### Phase 2: AWS account setup 🧑
Step-by-step: **`docs/AWS_DEPLOYMENT_GUIDE.md`** Parts 1–4.

| Status | Task | Notes |
|---|---|---|
| ⬜ | Create the AWS account under the chosen owner | Choose the **Paid plan** (the Free plan auto-closes after 6 months). Turn on MFA for the root user |
| ⬜ | Create an admin user for daily use | IAM Identity Center with MFA. Never use the root user day to day |
| ✅ | Accept the **AWS BAA** in AWS Artifact | Done 2026-11-13: AWS Organizations BAA, Active on Relay-Clinic-Test (000755994402) |
| ⬜ | Set **billing alarms** | $50 and $100/month budgets are created automatically by the deploy (`infra/`) |
| ⬜ | Apply for nonprofit or startup credits | |
| ⬜ | Turn on Bedrock access for Claude | Submit the one-time Anthropic use-case form in the Bedrock console |
| ⬜ | Buy an SMS number and start **toll-free verification or 10DLC** | Use the clinic's name. **Can take days to weeks, so start early.** |
| ⬜ | Request SMS **production access** (leave the sandbox) and a **spending limit** above $1/month | Through an AWS support case |
| ⬜ | Register a domain | Route 53, about $15/year |
| ⬜ | Price it in the AWS Pricing Calculator and share with the clinic | calculator.aws |

---

## Part 2: Code work, split across agents

### Things in the code that affect the plan

| Finding | Why it matters |
|---|---|
| **Newest work is only on `origin/Saajan`** | Your 4 newest commits (call queue runner, ElevenLabs voice agent, `supabase-setup.sql`) aren't on `main`. Merge first so every agent starts from the latest version. |
| ~~**`/api/calls/initiate` has no login check**~~ | Resolved: all voice-call routes were deleted (SMS-only, 2026-11-14). |
| **The app is built on Supabase** | `data.ts` and `supabase.ts` use the Supabase library, and the browser talks to the database directly. Moving to AWS means only Relay's server talks to the database, with Supabase code removed. |
| ~~**Voice uses ElevenLabs + Twilio**~~ | Resolved: voice was removed (SMS-only, 2026-11-14), so neither vendor is needed. |

### Agents

**Step 0, before any agent starts:** merge `origin/Saajan` into `main`. Each agent then works in its own isolated copy (git worktree) so they don't overwrite each other.

| Agent | Job | Main files it touches | Can start now? |
|---|---|---|---|
| **A. Foundation (Supabase → AWS)** | **Remove Supabase completely**: delete `supabase.ts`, the `@supabase/supabase-js` package and the Supabase settings in `.env.local`. Use a standard Postgres connection that works with local Postgres now and AWS RDS later. Convert `supabase-setup.sql` into plain Postgres migration files, dropping Supabase-only parts. Move all database access to Relay's server (the browser never touches the database), keeping data-layer function names so screens don't change. Add **Cognito** staff login (mock login for local development), roles (MA/admin) and protection on every API route, including `/api/calls/*`. Add an audit log; keep patient data out of logs. Write a setup guide for local Postgres on a Mac. | `data.ts`, `supabase.ts` (deleted), `package.json`, new API routes, login page, `layout.tsx`, migrations, `docs/` | ✅ **Yes, highest priority** |
| **B. Scripts & Safety** | SMS agent prompt (`SMS_AGENT_PROMPT.md`); emergencies (chest pain, suicidal thoughts) → tell the patient to call 911/988 and flag red **Escalated**; "talk to a human" → amber item; no medical details in texts; AI disclosure; identity check; STOP/HELP; Spanish | `docs/` only | ✅ Yes, no code conflicts |
| **C. Clinic Docs** | Clinic question list, vendor/BAA tracker, intake consent wording, staff cheat sheet, 30-minute training outline, test-case script, plan B if Relay goes down, one-page security policy, breach response steps | `docs/` only | ✅ Yes, no code conflicts |
| **D. SMS texting** | `messages` table and opt-out flag; `sendSms` / `getMessageThread` / channel preference in the data layer; SMS thread on referral detail; SMS rows in the Messages log; channel setting; inbound reply webhook; AWS End User Messaging adapter (mocked first); AI replies via Bedrock; captured slots go to the MA confirm queue; quiet hours and attempt limits | `data.ts`, `types.ts`, referral detail, calls, settings, new API route | ⏳ After **A** is merged |
| **E. eCW CSV import** | Upload screen; column mapping; match patients to referrals; auto-mark **Booked**; cancellations re-enter outreach; review list for unmatched rows | new import screen, `data.ts`, `types.ts`, Sidebar | ✅ **Built** (`/schedule-import`, see `relay-app/README.md`); confirm the column mapping once a real eCW export is available |
| **F. AWS Deployment** | Beginner step-by-step setup guide; ECS Fargate hosting (Dockerfile + CDK in `infra/`); RDS; Cognito; secrets in Secrets Manager; HTTPS and domain; backups; billing alarms; log retention; installable browser app (PWA) | new config files, `next.config.ts`, `public/`, `docs/` | ⏳ After **A** is merged and the AWS account exists |

### Run order

| Step | Agents (run in parallel within a step) | Waits for |
|---|---|---|
| **1** | Merge branch → **A. Foundation**, **B. Scripts & Safety**, **C. Clinic Docs** | Nothing; can start now |
| **2** | **D. SMS texting** | A merged |
| **3** | **E. eCW CSV import** | D merged |
| **4** | **F. AWS Deployment** | A merged + AWS account created |

**Rules for every agent:**
- Follow `CLAUDE.md`: single data layer, one screen per file, coherent design, keep amber vs red urgency.
- Read the Next.js docs in `relay-app/node_modules/next/dist/docs/` first, since this Next.js version has breaking changes.
- Use fake data only.
- Work in an isolated git worktree.

---

## Part 3: Launch together

### Phase 6: Deploy to AWS 🤝

Guide: **`docs/AWS_DEPLOYMENT_GUIDE.md`** Parts 5–7. Compliance check: **`docs/AWS_HIPAA_CHECKLIST.md`**.

| Status | Task | Who |
|---|---|---|
| ⬜ | Install tools on the Mac (Node 22, AWS CLI, Docker Desktop); fill in `infra/cdk.json` | 🧑 with 🤖 guidance |
| ⬜ | `npx cdk bootstrap` then `npx cdk deploy` in `infra/` (creates network, private RDS, ECS Fargate app + load balancer + HTTPS, Cognito, secrets, SMS topic, outreach schedule, CloudTrail, alarms, budgets) | 🧑 with 🤖 guidance |
| ⬜ | Check the database migrations ran (automatic at app start-up; see `/relay/app` logs); create staff logins in Cognito (`admin` / `ma` groups, MFA) | 🤝 |
| ⬜ | Delete or pause the old Supabase project | 🧑 (it only ever held fake data) |
| ⬜ | Connect texting: two-way SMS on the number → SNS topic `relay-inbound-sms`; subscription **Confirmed** | 🤝 |
| ⬜ | Smoke tests: signed-out → `/login`, API → 401, HTTP → HTTPS, DB *not publicly accessible*, test text to own phone, outreach tick 200 | 🤝 |
| ⬜ | Rehearse "pause all texting" and a backup restore once | 🤝 |
| ⬜ | Tick every row in `docs/AWS_HIPAA_CHECKLIST.md` | 🤝 |

### Phase 7: Testing (fake patients only) 🤝

| Status | Task | Notes |
|---|---|---|
| ⬜ | Text fake patients on your team's own phones | |
| ⬜ | Role-play hard cases | Angry patient, "who is this?", Spanish, no transportation, emergency phrase, wrong number, STOP |
| ⬜ | MA runs the full workflow | Text → patient picks slot → confirm queue → book in eCW → confirm in Relay |
| ⬜ | Test CSV import with the sample eCW export | |
| ⬜ | Clinician and MA review transcripts and sign off | Required before real patients |

### Phase 8: Training and soft launch 🤝

| Status | Task | Notes |
|---|---|---|
| ⬜ | 30-minute staff training | Amber vs red, confirm queue, escalations |
| ⬜ | Cheat sheet at the front desk; installed app on clinic computers | |
| ⬜ | Agree on plan B | If Relay breaks, staff call patients as before |
| ⬜ | Soft launch with 5–10 real patients | Read every conversation |
| ⬜ | Expand to the full pilot group | |

### Phase 9: Run the pilot 🤝

| Status | Task | Notes |
|---|---|---|
| ⬜ | Read conversations weekly for the first month | Fix scripts as you learn |
| ⬜ | 15-minute weekly check-in with the clinic | |
| ⬜ | Track bookings against the baseline, and AWS costs | |
| ⬜ | End-of-pilot review | Continue, expand, or add the eCW live feed? |

---

## Later (not for the pilot)

| Item | Options |
|---|---|
| **eCW live schedule** | HL7 SIU feed or eCW API |
| **Open-slot availability from eCW** | Depends on what eCW exposes |
| **Compliance tools** | Vanta or Drata, if offering Relay to more clinics |

---

## Timeline (rough)

| Weeks | What's happening |
|---|---|
| **1–2** | Clinic conversations; start SMS registration; Agents A, B, C |
| **2–5** | Legal and ownership; AWS account; Agents D, E |
| **5–7** | Agent F; deploy to AWS |
| **7–9** | Testing with fake patients; clinician sign-off |
| **10** | Training and soft launch |
