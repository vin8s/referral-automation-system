# Relay — AWS Deployment Guide (for beginners)

This guide takes you from **no AWS account** to **Relay running on AWS** for the SMS pilot.
Follow the parts in order. Each step says what to click or type and **what success looks like**.

> **Tip:** press **Cmd+Shift+V** in VS Code to read this formatted.
> **Golden rule:** no real patient data anywhere until the AWS BAA (Part 1, step 4) is accepted
> **and** every row in `docs/clinic/VENDOR_BAA_TRACKER.md` that touches PHI is signed. Use fake data only.

**Time needed:** about 3–4 hours of your time, spread over 1–3 weeks (phone-number registration
is the slow part, so start Part 3 early). **Cost:** see [Part 10](#part-10-monthly-cost) (~$60–75/month).

Related: `docs/AWS_HIPAA_CHECKLIST.md` (why each service is allowed), `docs/clinic/COST_ESTIMATE.md`,
`infra/` (the code that builds everything), `relay-app/Dockerfile` (how the app is packaged).

---

## What you are building

```
 Staff browser / installed app
        │ HTTPS (padlock)
        ▼
 Load balancer (public)  ──▶  Relay app container (ECS Fargate)  ──TLS──▶  Postgres database (RDS, PRIVATE)
                                   │           │            │
                         Cognito login   Bedrock (Claude)   End User Messaging (sends texts)
                                                                   │
 Patient's phone ◀──SMS──▶ clinic phone number ──inbound text──▶ SNS topic ──HTTPS──▶ Relay /api/sms/inbound
 Scheduler (every 10 min, clinic hours) ──▶ small Lambda ──HTTPS──▶ Relay /api/sms/outreach/tick
```

**Words you'll see** (each is explained again the first time it matters):

| Term | One-line meaning |
|---|---|
| **AWS account** | Your organization's container for everything in AWS, and the thing that gets the bill. |
| **Root user** | The email/password that created the account. All-powerful; lock it away after setup. |
| **IAM Identity Center** | AWS's login system for people (you) who manage the account day to day. |
| **Region** | Which AWS data-center area your resources live in (we use **us-east-2**, Ohio). |
| **BAA** | Business Associate Agreement: AWS's contract promising to protect PHI. Accepted in **AWS Artifact**. |
| **CDK** | "Cloud Development Kit": code in `infra/` that describes all the AWS pieces, so you create them with one command instead of 100 clicks. |
| **CloudFormation** | The AWS service that CDK hands that description to; it creates/updates/deletes the pieces as one **stack**. |
| **ECS Fargate** | Runs the Relay app as a **container** (a packaged copy of the app) without you managing servers. |
| **Load balancer (ALB)** | The public front door. Holds the HTTPS certificate and forwards traffic to the app. |
| **RDS** | Managed Postgres database. Ours is **private**: it has no internet address at all. |
| **Cognito** | Staff login (email + password + authenticator-app code). |
| **Secrets Manager** | Locked box for passwords and keys. The app reads them at start-up; nobody types them. |
| **KMS** | Key Management Service: the encryption key that scrambles the database, secrets and logs at rest. |
| **End User Messaging** | AWS's SMS service (sends and receives the texts). |
| **SNS** | Simple Notification Service: delivers each incoming text to Relay over HTTPS. |
| **EventBridge Scheduler** | AWS's alarm clock; pokes Relay every 10 minutes during clinic hours to send due texts. |
| **CloudWatch** | Where logs and alarms live. |
| **CloudTrail** | A permanent record of every action anyone takes in the AWS account (audit trail). |

### Why this design (and not Amplify)

The launch plan originally said **Amplify Hosting**. We checked the current AWS documentation (Nov 2026):

- Amplify's own docs say it supports Next.js **up through version 15**. Relay uses **Next.js 16** (and its new `proxy.ts`). ([source](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html))
- Amplify's server compute **cannot join your private network (VPC)**, so the database would have to be
  **publicly reachable** or you'd need an extra Lambda "bridge". A publicly reachable database holding PHI is
  exactly what we want to avoid. ([AWS re:Post](https://repost.aws/questions/QUaqTDfgxWSEOLwbzsWhfnNg/next-js-on-amplify-how-to-connect-to-an-rds-database))
- **App Runner** (the other "easy" option) **closed to new customers on April 30, 2026** and isn't on the HIPAA
  eligible list. ([source](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html))
- **Lightsail** is not HIPAA eligible.

So Relay runs as one small container on **ECS Fargate** behind a **load balancer**, with a **private RDS** database.
Every service involved is on AWS's HIPAA-eligible list, it runs Next.js 16 exactly as `next start` does, and the CDK
code builds all of it with one command. The trade-off: the load balancer and its public IP addresses add about
$25/month compared with Amplify.

---

## Part 1 — Create and secure the AWS account (≈45 min)

### Step 1. Decide who owns the account
Ask the clinic first (Phase 0 of `docs/CLINIC_LAUNCH_PLAN.md`). **Route A** (recommended): the clinic owns the
account and pays the bill; you are invited as an administrator. **Route B**: your LLC owns it.
Use an email address the **owner** controls long-term (e.g. `aws-admin@clinic.org`), not a personal Gmail.

### Step 2. Sign up
1. Go to <https://aws.amazon.com> → **Create an AWS Account**.
2. Enter the owner email and an account name like `relay-clinic`.
3. When asked to choose a plan, choose **Paid plan**. (The *Free plan* closes the account automatically after
   6 months and blocks some services. The Paid plan still gets the new-customer credits.
   [AWS Free Tier FAQ](https://aws.amazon.com/free/faqs/))
4. Contact type: **Business** (use the clinic's legal name and address). Add a payment card.
5. Identity check by phone/SMS, then choose **Basic support (free)**.
6. **If you signed up through AWS's simplified "new AWS experience"** (a *project* managed at
   <https://settings.aws.com>): upgrade to the **Paid plan** first (credits carry over), then use
   **Activate advanced AWS features** ([AWS docs](https://docs.aws.amazon.com/accounts/latest/reference/activate-advanced-features.html)).
   Without it the account cannot accept the **HIPAA BAA**. What happens when you activate it (this is what
   happened for the Relay pilot account):
   - AWS creates an **organization** with a separate **management account** (used for billing, the BAA and
     organization-wide policies) and turns your project into a **member account** — Relay runs in the member
     account (for the pilot: `Relay-Clinic-Test`, account ID in `docs/private/AWS_PRIVATE_IDS.md`).
   - The project's **home Region is fixed** (for the pilot: **us-east-2, Ohio**) and a Region-restriction policy
     denies regional services (End User Messaging, RDS, ECS…) anywhere else. Bedrock AI calls work from any Region.
   - The BAA is then accepted as the **AWS Organizations BAA** from the management account (Step 4).

**Success:** you can sign in to <https://console.aws.amazon.com> as the **root user** (or the project owner), the
account is on the Paid plan, and `aws organizations describe-organization` shows your organization.

### Step 3. Protect the root user with MFA
**MFA** = multi-factor authentication: a 6-digit code from an app on your phone in addition to the password.
1. Top-right account name → **Security credentials** → **Assign MFA device**.
2. Name it `root-phone`, choose **Authenticator app** (Google Authenticator, Microsoft Authenticator, 1Password…),
   scan the QR code, enter two codes in a row.
3. Store the root password in a password manager. Do **not** create access keys for the root user.

**Success:** the Security credentials page lists one MFA device.

### Step 4. Accept the AWS BAA (AWS Artifact)
**Done for the pilot account on 2026-11-13** (AWS Organizations BAA, verified Active from the Relay account).
For a new account:
1. If the account is part of an organization (Step 2 item 6), sign in to the **management account**
   (AWS Settings → "Centrally manage your organization"). Otherwise stay in the Relay account.
2. Console search bar → **Artifact** → **AWS Artifact** → **Agreements** (left menu).
3. In an organization: tab **Organization agreements** → **AWS Organizations Business Associate Addendum**
   (it covers every account in the organization). Standalone account: tab **Account agreements** →
   **AWS Business Associate Addendum**.
4. Accepting the NDA only lets you *read* the BAA — it is not the signature. After the NDA, click
   **Accept agreement**, tick the boxes, accept. If AWS asks to enable Artifact for the organization, say yes.
   (Only someone allowed to sign for the clinic should do this.)
5. Record the date in `docs/clinic/VENDOR_BAA_TRACKER.md` (row "AWS account BAA").

**Success:** the agreement shows status **Active** — and, in an organization, `aws artifact list-customer-agreements`
run from the **Relay** account lists it too.

### Step 5. Let administrators see billing
Still as root: account name → **Account** → scroll to **IAM user and role access to Billing information** →
**Edit** → tick **Activate IAM Access** → **Update**. (Otherwise your day-to-day admin can't see the bill.)

### Step 6. Create your day-to-day admin login (IAM Identity Center)
> **New AWS experience / project accounts:** you already have a day-to-day login through
> <https://settings.aws.com> (the project owner's sign-in, plus an "Identity Delegated Admin" project AWS created).
> For the pilot you can **skip this step** and keep using that login; `aws login --profile relay` works with it.

**IAM Identity Center** gives you a separate login so you never use root again.
1. Make sure the region selector (top-right) says **Ohio (us-east-2)**. Search **IAM Identity Center** → **Enable**.
   If asked, choose **Enable with AWS Organizations**.
2. **Users** → **Add user**: your email, first/last name → **Next** → skip groups → **Add user**. You'll get an invitation email.
3. **Permission sets** → **Create permission set** → **Predefined** → **AdministratorAccess** → session duration **4 hours** → **Create**.
4. **AWS accounts** → tick your account → **Assign users or groups** → your user → **AdministratorAccess** → **Submit**.
5. **Settings** → **Authentication** → **Configure** MFA → **Every time they sign in**, MFA types **Authenticator apps** (+ security keys if you have one).
6. Accept the invitation email, set a password, set up MFA. Bookmark the **AWS access portal URL**
   (looks like `https://d-xxxxxxxxxx.awsapps.com/start`).
7. Sign out of root. From now on, sign in through the access portal → your account → **AdministratorAccess** → **Management console**.

**Success:** you're in the console via the portal, and the top-right shows `AdministratorAccess/your-name`.

### Step 7. Choose the region and stick to it
Everything goes in **us-east-2 (Ohio)**, the project's home Region. A project account's organization carries a
Region-restriction policy: regional services (End User Messaging, RDS, ECS, …) work **only** in the home Region and
fail elsewhere with "explicit deny in a service control policy". Bedrock AI calls work from any Region. Always check
the top-right region selector says **Ohio** before creating anything. (A standalone account could use another
Region: change `relay:region` in `infra/cdk.json` and use it everywhere below.)

### Step 8. Apply for credits (optional, recommended)
- 501(c)(3) clinic: **AWS Nonprofit Credit Program** (via TechSoup / <https://aws.amazon.com/government-education/nonprofits/>).
- Your LLC (Route B): **AWS Activate** (<https://aws.amazon.com/startups/credits>).

---

## Part 2 — Turn on Claude in Bedrock (≈15 min)

**Bedrock** is AWS's service for AI models; Claude runs inside it, covered by your BAA.
1. Console search **Bedrock** → region **Ohio** → left menu **Model catalog**.
2. Filter provider **Anthropic**, open the Claude model you'll use. The infrastructure defaults to
   **Claude Haiku 4.5** (`us.anthropic.claude-haiku-4-5-20251001-v1:0`, setting `relay:bedrockModelId` in
   `infra/cdk.json`), tested live with fake patients. Newer models are only callable through their **`us.` inference
   profile ID**, never the bare `anthropic.…` ID. Claude Haiku 5.5 (`us.anthropic.claude-haiku-5-5`) is about 10×
   cheaper per token but was still "not available for this account" on the pilot project account; try it again
   later and switch if it answers a test message. If testing against `docs/CONVERSATION_TEST_CASES.md` shows a model
   missing safety cases, step up to Claude Sonnet 5.5 (`us.anthropic.claude-sonnet-5-5`).
3. The first time you use an Anthropic model, Bedrock asks for a short **use-case form**. Fill it in
   (company = clinic, use case = "patient appointment-scheduling text replies, human-reviewed").
4. Open **Playground → Chat**, choose the model, type a **fake** test message. **Success:** Claude replies.
5. Copy the exact **model ID** (or **inference profile ID**, e.g. one starting with `us.`) shown on the model's page,
   and put it in `infra/cdk.json` → `relay:bedrockModelId` (Part 5).

---

## Part 3 — Get a texting number (start early: days to weeks)

> **Pilot status (2026-11-14):** toll-free number (number in `docs/private/AWS_PRIVATE_IDS.md`) is already purchased in us-east-2
> (`phone-…`, full ID in `docs/private/AWS_PRIVATE_IDS.md`) and its toll-free registration exists as a **draft** filled with
> Rhode Island Free Clinic's public details. Still needed before submitting: the clinic's legal name as registered,
> EIN, a contact person's name, and a photo/scan of the intake form showing the SMS consent checkbox.

US carriers only deliver business texts from **registered** numbers. Start this as soon as the account exists.

### Step 1. Buy a toll-free number (recommended for a pilot)
**Toll-free** (8XX numbers) is the simplest US option for low volume: one registration, $2/month.
(**10DLC** local numbers are the alternative: brand + campaign registration, more fees; see pricing in Part 10.)
1. Console search **End User Messaging** → **SMS** → left menu **Configurations → Phone numbers** → **Request originator**.
2. Country **United States**, use case **Transactional**, capabilities **SMS** (leave voice/MMS off),
   number type **Toll-free**, **Two-way messaging: enabled** → **Next** → **Request**.

**Success:** the number appears with status **Pending registration** or **Active**.

### Step 2. Register it (toll-free verification)
1. **Registrations** → find the toll-free registration created for your number (or **Create registration → US toll-free number registration**).
2. Use the **clinic's legal name**, address, website and a clinic contact. Describe the use case honestly:
   *"Appointment scheduling messages to patients who were referred to a specialist and consented on the
   intake form. Patients can reply to choose a time. Reply STOP to opt out."*
3. **Opt-in proof:** upload a picture/PDF of the intake-form consent wording (`docs/clinic/PATIENT_CONSENT.md`).
4. **Sample messages:** paste 2–3 templates from `docs/SMS_TEMPLATES.md` (no medical details, includes clinic name and STOP).
5. Monthly volume: "under 1,000". Submit.

**Success:** status **Reviewing**. Approval usually takes days to a few weeks. AWS emails you if they need changes.

### Step 3. Leave the SMS sandbox and raise the spending limit
New accounts are in the **SMS sandbox**: texts only go to phone numbers you've verified, and spending is capped at
**$1/month**. ([AWS docs](https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html))
1. End User Messaging → SMS → **Overview** → **Request production access** (or open a support case:
   **Support Center → Create case → Service limit increase**, service **End User Messaging SMS**, quota
   **SMS Production Access**, region **us-east-2**, value **1**).
2. In the same case (or a second one) ask for a **monthly SMS spending quota of $50** for us-east-2.
   ([AWS docs](https://docs.aws.amazon.com/sms-voice/latest/userguide/awssupport-spend-threshold.html))
3. While you wait, add **your own phone** for testing: **Sandbox → Destination phone numbers → Add**, enter the
   code you receive.

**Success:** support case says production access granted; **Account settings** shows your new spend limit.

### Step 4. Write down the number details
From **Phone numbers**, copy the **Phone number ID** (`phone-xxxxxxxx…`) and the number in `+1XXXXXXXXXX` form.
You'll put them in `infra/cdk.json` in Part 5. (Two-way SMS is connected to Relay in Part 7.)

---

## Part 4 — Get a domain name (≈15 min, ~$15/year)

Staff will open something like `https://relay.yourclinic.org`. HTTPS certificates need a real domain.

**Option A (easiest): the clinic already has a domain** at another registrar (GoDaddy, Squarespace…).
You'll add two DNS records there during deploy (Part 6). Leave `relay:hostedZoneId` blank.

**Option B: register one in Route 53** (**Route 53** = AWS's domain/DNS service).
1. Console search **Route 53** → **Register domains** → search a name → buy (~$15/year; turn **auto-renew** on).
2. When it's ready, **Hosted zones** → click the domain → copy the **Hosted zone ID** (`Z0123…`).

**Success:** you know your app address (e.g. `relay.yourclinic.org`) and, for option B, the hosted zone ID.

---

## Part 5 — Set up your Mac and the configuration (≈45 min)

### Step 1. Install the tools
1. **Node.js 22 LTS**: <https://nodejs.org> → macOS installer. Check: `node -v` prints `v22…`.
2. **AWS CLI v2** (the `aws` command): <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
   → macOS **pkg** installer. Check: `aws --version`.
3. **Docker Desktop** (builds the app container): <https://www.docker.com/products/docker-desktop/> → Mac with
   Apple chip. Open it once and leave it running while you deploy. Check: `docker info` prints details, no error.
   (Docker Desktop is free for small organizations; check its terms for the clinic.)
4. The **CDK** is installed per project (step 4), nothing global needed.

### Step 2. Connect the AWS CLI to your account
```bash
aws configure sso
```
Answer: session name `relay`, start URL = your **AWS access portal URL**, region `us-east-2`, scopes: press Enter.
A browser opens: approve. Pick your account and **AdministratorAccess**, default region `us-east-2`, output `json`,
profile name `relay`. Then, in every new Terminal window:
```bash
export AWS_PROFILE=relay
aws sts get-caller-identity
```
**Success:** prints your 12-digit account ID. (If it later says the token expired: `aws sso login`.)

### Step 3. Fill in `infra/cdk.json`
Open `infra/cdk.json` and change the `relay:*` values. **Never put passwords or keys here** (they're generated for you).

| Setting | What to put |
|---|---|
| `relay:region` | `us-east-2` |
| `relay:domainName` | The app address, e.g. `relay.yourclinic.org` |
| `relay:hostedZoneId` / `relay:hostedZoneName` | Route 53 option: zone ID and `yourclinic.org`. Other registrar: leave both `""` |
| `relay:cognitoDomainPrefix` | Unique, lowercase, e.g. `relay-rifc` (becomes `relay-rifc.auth.us-east-2.amazoncognito.com`) |
| `relay:alertEmail` | Who gets budget and outage emails |
| `relay:clinicTimeZone` | `America/New_York` for Rhode Island Free Clinic |
| `relay:clinicDisplayName` | Name used in texts: `Rhode Island Free Clinic` |
| `relay:clinicLoginName` | Clinic name on the sign-in screen and in the staff invitation email. Default `Rhode Island Free Clinic`. |
| `relay:clinicPhoneNumber` | The clinic's **scheduling phone line** that patients can call; it appears inside texts as `{{clinic_phone}}` (`docs/SMS_TEMPLATES.md`). For the pilot: `(401) 274-6347`. This is **not** the texting number. |
| `relay:smsOriginationIdentity` | Phone number ID from Part 3 step 4 (blank until then) |
| `relay:bedrockModelId` | From Part 2 |
| `relay:outreachCron` | When the outreach "tick" runs, in the clinic's time zone. Default `cron(0/10 8-19 ? * MON-SAT *)` = every 10 min, 8:00–19:50, Mon–Sat (matches the texting window in AGENT_SAFETY_RULES.md; Relay itself still enforces quiet hours) |
| `relay:outreachEnabled` | `true` (set `false` to stop automatic outreach) |
| `relay:pauseTexting` | `false` (emergency switch, Part 8) |
| `relay:subscribeInboundSms` | `true` |
| `relay:budgetWarnUsd` / `relay:budgetLimitUsd` | `50` / `100` |

### Step 4. Install the project packages and check the configuration
```bash
cd infra
npm ci
npx cdk synth --quiet
```
**Success:** no errors. Warnings about "placeholder value" mean you missed a setting in step 3.

---

## Part 6 — Deploy (≈30–45 min, mostly waiting)

### Step 1. One-time CDK setup ("bootstrap")
Creates a small storage bucket and container registry CDK uses to upload the app.
```bash
npx cdk bootstrap
```
**Success:** `Environment aws://123456789012/us-east-2 bootstrapped.`

### Step 2. Deploy everything
Make sure Docker Desktop is running, then:
```bash
npx cdk deploy
```
CDK builds the app container (5–10 min the first time), shows a list of security changes → type **y**.
CloudFormation then creates ~100 resources (20–30 min; the database is the slowest).

- **Other-registrar domain (option A):** while it waits on the certificate, open **Certificate Manager (ACM)** in the
  console → the pending certificate → copy the **CNAME name/value** → add that CNAME at your registrar.
  The deploy continues on its own once AWS sees it (5–30 min).
- **Check your email:** confirm the **"AWS Notification – Subscription Confirmation"** for `relay-ops-alerts`
  (otherwise you won't get outage alarms).

**Success:** the terminal ends with `✅ Relay` and a list of **Outputs**: `AppUrl`, `LoadBalancerDns`,
`UserPoolId`, `InboundSmsTopicArn`, `AppTaskRoleName`, … Save them (they're also under
**CloudFormation → Relay → Outputs**).

- **Option A domain only:** at your registrar add a **CNAME** record: name `relay` (your subdomain) → value =
  the `LoadBalancerDns` output. (Route 53 users: this was done automatically.)

### Step 3. Secrets (nothing to type, just check)
Open **Secrets Manager**. You should see `relay/database`, `relay/auth-secret`, `relay/outreach-cron-token`,
`relay/cognito-client-secret`. All were generated during deploy and are injected into the app at start-up.
To rotate `relay/auth-secret` (signs everyone out): **Retrieve secret value → Edit** → paste a new value from
`openssl rand -base64 48` → Save → then restart the app (ECS → Clusters → `relay` → service `relay-app` →
**Update** → tick **Force new deployment** → **Update**).

### Step 4. Database migrations (automatic)
Every time a new app container starts it runs the migrations (`db/migrations/*.sql`) **before** accepting traffic.
If one fails, the new version never goes live and ECS keeps the old one.
Check: **CloudWatch → Log groups → `/relay/app`** → newest stream → look for
`Applied migrations: 001_init.sql` (first deploy) or `Migrations: already up to date`.
Fake seed data is **never** loaded in production (the script refuses).

### Step 5. Create staff logins (Cognito)
Follow **[docs/STAFF_LOGINS.md](STAFF_LOGINS.md)** §1: Cognito → User pools → `relay-staff` → Users → **Create user**
→ *Send an email invitation*, the person's email, tick **Mark email address as verified**, *Generate a password* →
then add them to group `admin` (you, clinic lead) or `ma` (medical assistants / front desk). A user in **neither**
group can't get in. Or use the one CloudShell command in that doc.

Each person then opens `AppUrl` → **Sign in** → temporary password (valid 3 days) → new password → scans the QR code
with an authenticator app. **MFA is required for everyone**; there is no SMS option. Cognito sends these emails
itself (from no-reply@verificationemail.com), **max 50 emails/day per AWS account**.

**Success:** you can sign in at `AppUrl`; the sign-in page shows the Rhode Island Free Clinic + Relay logo with teal
buttons; **Sign out** returns you to Relay's "You have been signed out" screen; an `ma` user can't change Settings.

### Step 6. HTTPS check
Open `AppUrl` → padlock icon, certificate issued to your domain. `http://` addresses redirect to `https://`.

---

## Part 7 — Connect texting and run the smoke tests

### Step 1. Send inbound texts to Relay (two-way SMS)
1. **End User Messaging → SMS → Phone numbers** → your number → **Two-way SMS** tab → **Edit settings**.
2. Turn on **Enable two-way message**, destination type **Amazon SNS**, **Existing SNS standard topic** →
   `relay-inbound-sms`, permissions **Use SNS topic policies** → **Save**.
3. If you hadn't filled in `relay:smsOriginationIdentity` yet, do it now and run
   `npx cdk deploy` again.

### Step 2. Confirm the SNS → Relay subscription
**SNS → Topics → `relay-inbound-sms` → Subscriptions**: the `https://…/api/sms/inbound` row must say **Confirmed**.
If it says **Pending confirmation** (e.g. the app version with SMS support wasn't deployed yet): select it →
**Request confirmation**. Relay confirms it automatically when its inbound endpoint is live.

### Step 3. Smoke tests (fake data only)
Run these from Terminal (replace the address):

| Test | Command / action | Expected |
|---|---|---|
| Signed-out page redirects | `curl -sI https://relay.yourclinic.org/dashboard \| head -3` | `HTTP/2 307` with `location: /login…` |
| API needs login | `curl -s -o /dev/null -w "%{http_code}\n" https://relay.yourclinic.org/api/referrals` | `401` |
| HTTP → HTTPS | `curl -sI http://relay.yourclinic.org \| head -2` | `301` to `https://` |
| Login | Browser → sign in with MFA | Dashboard loads |
| Install the app | Chrome/Edge: install icon in the address bar → **Install Relay**. Safari: **File → Add to Dock** | Relay opens in its own window with the teal icon |
| Database is private | RDS → Databases → `relay…` → **Connectivity & security** | **Publicly accessible: No** |
| Test text | Create a **fake** referral with **your own** phone number; start outreach for it | You receive the text; reply "1"; the reply shows on the referral and the slot reaches the confirm queue |
| Outreach tick | **Lambda → `relay-outreach-tick` → Test** (any event) | Log line `{"msg":"outreach tick","status":200}` |
| Scheduler | **EventBridge → Scheduler → Schedules → `relay-outreach-tick`** | Status **Enabled**, next run in clinic hours |

---

## Part 8 — Running it day to day

### View logs
**CloudWatch → Log groups**: `/relay/app` (the app; use **Live tail** to watch), `/relay/outreach-tick`,
`/relay/vpc-flow-rejected`. The app never logs message bodies or patient details; **don't copy logs** into email,
chat or AI tools anyway.

### Alerts you may get by email
`relay-app-unhealthy` (site down), `relay-app-5xx` (errors), `relay-outreach-tick-errors`,
`relay-inbound-sms-undelivered` (a patient's reply couldn't reach Relay: it's held for 14 days in the
`relay-inbound-sms-dlq` queue; tell the developer), `relay-db-cpu-high`, `relay-db-storage-low`, and budget emails.

### 🚨 Emergency: pause ALL texting
Use this if texts are going wrong (wrong patients, bad wording, loops). Staff fall back to `docs/clinic/PLAN_B.md`.

**Fastest (1–2 minutes, console):**
1. **IAM → Roles** → open the role named in the `AppTaskRoleName` output → **Add permissions → Create inline policy → JSON**, paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{ "Sid": "EmergencyPauseAllTexting", "Effect": "Deny",
       "Action": ["sms-voice:SendTextMessage", "sms-voice:SendMediaMessage", "sms-voice:SendRcsMessage"], "Resource": "*" }]
   }
   ```
   Name it `EMERGENCY-pause-texting` → **Create policy**. From now on AWS refuses every text (SMS or RCS) Relay tries to send
   (incoming replies still arrive and are saved).
2. **EventBridge → Scheduler → `relay-outreach-tick` → Disable** (stops new outreach attempts).

**Same thing, recorded in code:** `npx cdk deploy -c relay:pauseTexting=true` (adds the same deny and disables the schedule).
**Whole site off:** ECS → cluster `relay` → service `relay-app` → **Update** → Desired tasks **0**.

**To resume:** delete the `EMERGENCY-pause-texting` inline policy, **Enable** the schedule (or deploy with
`relay:pauseTexting=false`), set desired tasks back to **1** if you changed it. Write down what happened
(`docs/clinic/BREACH_RESPONSE.md` if patient data may have gone to the wrong person).

### Deploy a new version of Relay
```bash
git pull
cd infra && export AWS_PROFILE=relay && aws sso login && npx cdk deploy
```
The new container starts, runs migrations, passes health checks, then replaces the old one: no downtime.

If a deploy switches the sign-in pages from Cognito's classic hosted UI to **managed login** (first deploy after
2026-11-14), anyone signed in to Cognito must sign in again. Passwords and authenticator apps are unchanged.

### Roll back
- **Automatic:** if the new version fails to start or fails health checks, ECS rolls back to the previous one by
  itself (deployment circuit breaker) and CloudFormation shows `UPDATE_ROLLBACK_COMPLETE`.
- **Manual (code):** `git checkout <last good commit>` → `cd infra && npx cdk deploy` → `git checkout main` afterwards.
- **Database:** migrations only move forward. To undo data damage, RDS → database → **Actions → Restore to point in
  time** creates a **new** database from any moment in the last 14 days; get developer help to switch Relay to it.

### Backups
RDS takes automatic daily backups, kept **14 days**, plus point-in-time restore. A final snapshot is kept if the
database is ever deleted. Once a month, check RDS → **Automated backups** shows recent restore points.

---

## Part 9 — Monthly cost check (10 min, monthly)

1. **Billing and Cost Management → Bills**: this month's total by service.
2. **Cost Explorer** → group by **Service**, last 3 months. Compare with [Part 10](#part-10-monthly-cost).
3. **Budgets** → `relay-monthly`: you get emails at **$50** (actual), **$100** (actual) and when the **forecast** passes $100.
4. Watch for surprises: End User Messaging (texting loops), Bedrock (AI usage), NAT Gateway (should be **none**).
5. Record it in the weekly check-in (Phase 9).

---

## Part 10 — Monthly cost

**Estimates, not quotes** (us-east-2, Nov 2026, pilot of 20–50 patients). Check them in the
[AWS Pricing Calculator](https://calculator.aws/). The same table is in `docs/clinic/COST_ESTIMATE.md`.

| Item | Assumption | ≈ $/month | Pricing page |
|---|---|---|---|
| Load balancer (ALB) | 730 h × $0.0225 + minimal traffic (LCUs) | 17–20 | [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| Public IPv4 addresses | 3 (2 for the ALB, 1 for the app) × $0.005/h | 11 | [VPC pricing](https://aws.amazon.com/vpc/pricing/) |
| ECS Fargate (ARM) | 0.25 vCPU + 1 GB, always on | 8.50 | [Fargate pricing](https://aws.amazon.com/fargate/pricing/) |
| RDS Postgres db.t4g.micro | single-AZ, ~$0.016/h (verify) | ~12 | [RDS Postgres pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| RDS storage gp3 20 GB | backups up to 20 GB free | ~2.50 | same |
| Secrets Manager | 4 secrets × $0.40 | 1.60 | [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/) |
| KMS | 1 key + requests | ~1 | [KMS pricing](https://aws.amazon.com/kms/pricing/) |
| CloudWatch | <1 GB logs + 6 alarms + flow logs | ~1.50 | [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) |
| Route 53 | hosted zone $0.50 (+ domain ~$15/yr) | 0.50 | [Route 53 pricing](https://aws.amazon.com/route53/pricing/) |
| ECR, S3, CloudTrail | small images/logs; first management trail free | <0.50 | [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/) |
| Cognito (Essentials) | < 10,000 monthly users free | 0 | [Cognito pricing](https://aws.amazon.com/cognito/pricing/) |
| Lambda, Scheduler, SNS, SQS | far below free allowances | ~0 | [Lambda](https://aws.amazon.com/lambda/pricing/) · [EventBridge](https://aws.amazon.com/eventbridge/pricing/) · [SNS](https://aws.amazon.com/sns/pricing/) |
| **Infrastructure subtotal** | | **≈ 56–60** | |
| Bedrock (Claude) | ~300 AI replies × ~3k in / 300 out tokens; Opus-class model | 3–8 (Haiku-class: <1) | [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) |
| End User Messaging SMS | toll-free number $2 + ~400 messages (≈ $0.01 each incl. carrier fees, verify in the per-country CSV) | 5–8 | [End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/) |
| **Total** | | **≈ $65–75** | |

One-time: domain ~$15/year; 10DLC instead of toll-free adds $4.50 brand registration (+ $41.50 optional vetting) and
$2–10/month per campaign. New accounts get up to **$200 in credits** for the first months, and nonprofit credits can cover more.

---

## Part 11 — Tear everything down (end of pilot)

⚠️ This deletes the running system. Export anything the clinic must keep **first**, and agree with the clinic how
long records must be retained (HIPAA documentation rules; ask the lawyer).

1. Pause texting (Part 8) and tell staff.
2. **RDS** → database → **Modify** → untick **Enable deletion protection** → **Apply immediately**.
3. **Cognito** → `relay-staff` → **Settings / Deletion protection** → turn off (only if deleting users too).
4. **CloudFormation** → stack `Relay` → **Stack actions → Edit termination protection** → **Deactivated**.
5. `cd infra && npx cdk destroy` → **y**. (10–20 min.)
6. Some things are **kept on purpose** so data isn't lost by accident; delete them by hand when sure:
   - RDS **final snapshot** (`Relay-…-snapshot-…`) — holds patient data; delete when retention ends.
   - Cognito user pool `relay-staff`; KMS key `alias/relay-data` (**Schedule key deletion**, 30 days; anything still
     encrypted with it becomes unreadable afterwards); log groups `/relay/*`; S3 buckets for CloudTrail and load
     balancer logs (empty, then delete).
7. **End User Messaging**: release the phone number; delete the registration (10DLC: deactivate campaign).
8. **Route 53**: turn off domain auto-renew if not needed; delete the hosted zone.
9. CloudFormation stack `CDKToolkit` (from bootstrap) can be deleted last (empty its S3 bucket and ECR repository first).
10. Next month: check the bill is ~$0.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `cdk deploy`: "Unable to resolve AWS account" / expired token | `export AWS_PROFILE=relay && aws sso login` |
| `cdk deploy`: Docker errors | Start Docker Desktop; `docker info` must work |
| Deploy stuck at `Certificate` for a long time | Add the ACM validation CNAME at your registrar (Part 6, step 2) |
| Deploy fails on `HostedDomain` (Cognito) | `relay:cognitoDomainPrefix` is taken; choose another |
| Stack rolled back, ECS service never stabilised | CloudWatch `/relay/app`: look for `Database command failed` (DB/migration) or `Auth misconfigured` |
| Login loops back to `/login` | Callback URL mismatch: `relay:domainName` must match the address you open |
| Texts not received | Sandbox (only verified numbers) / spending limit $1 / registration not approved / `relay:pauseTexting` on |
| Replies not showing in Relay | SNS subscription not **Confirmed** (Part 7 step 2), or two-way SMS not set on the number |
| Sign-in page says "redirect_mismatch" / sign-out shows a Cognito error | `APP_URL` doesn't match `relay:domainName`. The callback must be exactly `https://<domain>/api/auth/callback` and the sign-out URLs exactly `https://<domain>/login?signed_out=1` and `…/login?error=no_role` (redeploy after changing the domain). |
| Sign-in page is plain or blank after deploy | The managed-login style is missing for client `relay-web`: Cognito → Managed login → Styles. Redeploy, or create a style for the client. |
| "Your account hasn't been given access to Relay" | Add the user to group `ma` or `admin` (docs/STAFF_LOGINS.md §1). |
| Any AWS call fails with "explicit deny in a service control policy" | You're in the wrong Region: project accounts only allow regional services in their home Region (**us-east-2** for the pilot). |
