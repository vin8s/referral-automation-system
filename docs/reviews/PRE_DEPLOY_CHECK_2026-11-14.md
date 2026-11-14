# Relay pre-deploy check, 2026-11-14

Branch: `review/pre-deploy-check` (= `main` + the commits listed below).
Everything was checked **offline**: no AWS calls, no deploy, no Docker build, fake data only.

## Verdict: ready after 2 things

The AWS setup (CDK stack) is in good shape. It builds a template with no errors, every regional
resource is in **us-east-2**, and the security basics are in place (private encrypted database,
HTTPS only, MFA, KMS encryption, audit trail, alarms, budget).

Before you run `npx cdk deploy`:

1. **Merge this branch** (or at least commit `a0f9854`). `main` still uses Next.js 16.2.6, which has
   **critical published security holes**. One lets attackers get around the login check, and others
   let them run code on the server. This branch moves to 16.4.6.
2. **Fill in the 3 placeholder settings** in `infra/cdk.json` (see "Placeholders" below). Deploying
   with them as they are would create a site at `relay.example.org` that you don't own, and alarm
   emails would go to nobody.

You still can't text real patients until the toll-free number is registered and out of the SMS
sandbox. That doesn't block the deploy. You can deploy now and test with your own verified phone.

## Blocking issues

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `relay-app/package.json:27` (on `main`) | `next` 16.2.6 has critical/high advisories (Proxy bypass GHSA-6gpp-xcg3-4w24, image-optimizer RCE GHSA-2xp9-vwfh-vxw4 / GHSA-2464-fhr4-w9xw, `use cache` RCE GHSA-673q-mjm6-r5xr, SSRF, DoS). Relay's sign-in gate is `src/proxy.ts`. | **Fixed on this branch** (`a0f9854`, next 16.4.6). Merge it. |
| 2 | `infra/cdk.json:8` | `relay:domainName` is `relay.example.org` | Your real address, e.g. `relay.rifreeclinic.org` |
| 3 | `infra/cdk.json:11` | `relay:cognitoDomainPrefix` is `relay-clinic-change-me` | A unique lowercase name, e.g. `relay-rifc` |
| 4 | `infra/cdk.json:13` | `relay:alertEmail` is `owner@example.org` | Your real email (budget and outage alerts go here) |

`cdk synth` prints a warning for each of 2–4 until you fix them.

## Fixes on this branch

| Commit | What |
|---|---|
| `517a77f` (earlier run, **kept**) | KMS key policy lets SNS write into the encrypted inbound-SMS dead-letter queue. Without it, undelivered patient replies would be lost silently and the `relay-inbound-sms-undelivered` alarm could never fire. Also adds offline infra tests (`cd infra && npm test`). Checked: the statement is scoped to the `relay-inbound-sms` topic ARN and matches the AWS-documented pattern. |
| `7779762` (earlier run, **kept**) | Commits `infra/cdk.context.json` (us-east-2 Availability Zones for the Relay account) so synth is the same everywhere and needs no AWS lookup. Contains no secrets. **Update 2026-11-14:** now git-ignored and kept only locally, because it contains the AWS account ID; `cdk synth` without `--no-lookups` recreates it. |
| `67dc854` (earlier run, **kept**) | Built-in defaults are now Eastern time and Rhode Island Free Clinic (only used if a `cdk.json` value is missing). No template change. |
| `e10b34f` (earlier run, **kept**) | Docs: the emergency "pause texting" policy now also blocks RCS (matches the CDK). Also fixes the `clinicPhoneNumber` meaning and marks the AWS BAA as Active. |
| `02fbcc3` | **App:** with `NODE_ENV=production`, the mock SMS provider, the mock AI and the patient simulator are now **refused**. Before this, a production container missing `SMS_PROVIDER` would mark texts "delivered" without sending anything. CDK already sets `aws`/`bedrock`, so this is a safety net. New test file: `relay-app/test/production-guards.test.ts`. |
| `a0f9854` | **App:** Next.js 16.2.6 → 16.4.6 (+ `eslint-config-next`). The lockfile changes are only Next's own dependencies. |
| `6b13185` | **Infra:** `cdk synth` now warns while `relay:smsOriginationIdentity` is blank. |

## Things I confirmed (no change needed)

- **Region:** every Region name in the template is `us-east-2` (19 mentions, nothing else). The Bedrock
  permission covers both `inference-profile/*` in us-east-2 and `foundation-model/anthropic.claude-*`
  in every Region (`*`), which cross-Region profiles need. Model is `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- **Database:** not public, sits in isolated subnets with no internet route, KMS-encrypted, `rds.force_ssl=1`
  (and the app verifies the RDS certificate), 14-day backups, deletion protection on, final snapshot on delete.
  Only the app's security group can reach port 5432.
- **HTTPS:** the 443 listener uses TLS 1.2/1.3 (`ELBSecurityPolicy-TLS13-1-2-2021-06`), port 80 redirects to
  HTTPS, invalid headers are dropped, and the app sends HSTS. The app container only accepts traffic from
  the load balancer.
- **Encryption at rest:** one KMS key (`alias/relay-data`, yearly rotation, kept on teardown) encrypts the
  database, 4 secrets, 4 log groups, the inbound SNS topic, the SQS DLQ and the Lambda env vars. S3 log
  buckets use SSE-S3 with public access blocked and SSL enforced.
- **Logs:** 1-year retention. CloudTrail `relay-audit` is multi-Region with file validation, kept about 6 years.
- **Cognito:** MFA required (authenticator app only), no self sign-up, passwords need 12+ characters
  with all 4 character types, can't reuse the last 5, temporary passwords last 3 days, deletion protection on.
  The client secret is copied into Secrets Manager with its value hidden from logs.
- **SNS inbound:** only End User Messaging in this account may publish. SSL is enforced. The app checks the
  SNS signature, the certificate host and the topic ARN (a junk POST got `400`).
- **Outreach tick:** EventBridge Scheduler → Lambda → reads the bearer token from Secrets Manager → POST
  `/api/sms/outreach/tick`. The app compares the token in constant time, and calls without it get `401`.
  The Lambda logs only the HTTP status.
- **IAM:**
  - The app role can only send SMS/RCS in this account and Region, and call Claude on Bedrock.
  - The execution role reads only its 4 secrets.
  - The tick Lambda reads only the outreach token.
  - `pauseTexting=true` adds an explicit Deny and turns off the schedule (tested).
- **Alarms and budget:** site unhealthy, 5xx, tick errors, undelivered inbound texts, DB CPU, DB storage
  → `relay-ops-alerts` email. Budget is $100/month with an alert at $50 plus actual and forecast alerts at 100%.
- **Dev-only features in production:**
  - Mock login: refused (throws in production; `POST /api/auth/mock-login` → `404`).
  - Twilio test mode: refused (`getSmsProvider` throws; the Twilio inbound route → `404`).
  - Mock SMS/AI: refused from commit `02fbcc3` on.
  - Seeding fake data: refused (`scripts/db.ts`).
- **Container:**
  - Multi-stage `node:22-bookworm-slim` image that runs as the non-root `node` user.
  - The RDS CA bundle is baked in.
  - The entrypoint builds `DATABASE_URL` from the injected secret, unsets `DB_PASSWORD` and runs migrations
    before it starts the server.
  - `.dockerignore` keeps `.env*` and `*.pem` out of the image.
- **Production smoke test** (standalone server, `NODE_ENV=production`, dummy settings): `/login` → 200 (this
  is the load-balancer health check), `/dashboard` → 307 to login, `/api/referrals` → 401, tick → 401.

## Recommendations (not done, your call)

1. **First deploy with outreach off** (`"relay:outreachEnabled": false`) until the toll-free number is
   registered. Otherwise every tick that tries to text will fail and trigger `relay-outreach-tick-errors`.
2. **xlsx 0.18.5** (Excel import) has 2 high advisories (prototype pollution, ReDoS) and npm has no fix.
   Install SheetJS 0.20.x from SheetJS's own CDN, or accept the risk because only signed-in staff upload files.
3. **Other `npm audit` findings** mostly come from `shadcn` (a CLI that pulls in express/hono/zod). It's only
   used at build time (`globals.css`), so moving it to `devDependencies` takes those out of production.
   Re-run `npm audit --omit=dev` after merging.
4. **Pin the RDS certificate download** in `relay-app/Dockerfile:35` with `ADD --checksum=sha256:…`, so a
   changed file fails the build.
5. **Postgres 17 version:** `cfn-lint` (an old version, see below) says engine version `"17"` "is deprecated".
   It's probably wrong, because RDS accepts a major version and picks the default minor. To make sure, run
   `aws rds describe-db-engine-versions --engine postgres --engine-version 17 --default-only --region us-east-2`
   before deploying.
6. **CloudTrail:** if your AWS organization already has an organization trail, `relay-audit` is a second
   copy and costs a little (about $2 per 100k events). Keep it for a self-contained audit trail, or remove it.
7. **SCP exemptions:** AWS Budgets, CloudTrail's multi-Region trail and Bedrock cross-Region inference must
   be allowed by the organization's Region-restriction SCP. If the deploy fails with "explicit deny in a
   service control policy" on `MonthlyBudget` or `AuditTrail`, that's the cause.
8. **Smaller hardening** (later is fine):
   - Read-only root filesystem for the container.
   - Separate least-privilege DB users (already listed as a known gap).
   - An advisory lock around migrations if you ever run more than 1 task.
   - Re-check that the "Relay is SMS-only" note in the HIPAA checklist still holds if you turn on RCS.
9. **Lint:** 17 warnings, 0 errors (for example `react-hooks/set-state-in-effect` in `CommandPalette.tsx`).
   They aren't blocking.

## Placeholders to fill in (`infra/cdk.json`)

| Line | Setting | Now | Put |
|---|---|---|---|
| 8 | `relay:domainName` | `relay.example.org` | **Required.** Your app address |
| 9–10 | `relay:hostedZoneId` / `relay:hostedZoneName` | `""` | Only if the domain is in Route 53; otherwise leave blank and add the DNS records by hand (guide Part 6) |
| 11 | `relay:cognitoDomainPrefix` | `relay-clinic-change-me` | **Required.** Unique, lowercase |
| 13 | `relay:alertEmail` | `owner@example.org` | **Required.** Your email |
| 17 | `relay:smsOriginationIdentity` | `""` | `phone-…`, full ID in `docs/private/AWS_PRIVATE_IDS.md` (your toll-free number ID) once it's registered, then deploy again |

Already correct: Region `us-east-2`, `America/New_York`, clinic names, clinic phone `(401) 274-6347`,
Bedrock model, cron, budget 50/100.

## HIPAA checklist status (`docs/AWS_HIPAA_CHECKLIST.md`)

"Code" means the infrastructure code does it. "You" means only you can check it after deploying.

| Check | Status |
|---|---|
| AWS BAA accepted (Organizations BAA, 2026-11-13) | ✅ (per docs) |
| Root user MFA, no access keys | You (account setting) |
| Daily admin via IAM Identity Center + MFA | You |
| Everything in us-east-2 | ✅ Code (template checked; test enforces it) |
| Database not publicly accessible | ✅ Code (`PubliclyAccessible: false`, isolated subnets) |
| Database encrypted, 14-day backups, deletion protection | ✅ Code |
| Only HTTPS reaches the app | ✅ Code (redirect + TLS policy). Confirm with `curl -I http://…` after deploy |
| All API routes need login | ✅ Local smoke test (`/api/referrals` → 401). Confirm after deploy |
| Staff MFA required, no self sign-up | ✅ Code |
| Every staff user in exactly one group | You (after creating users) |
| Leavers disabled same day; quarterly review | You (process) |
| Secrets only in Secrets Manager | ✅ Code (4 generated secrets; nothing secret in `cdk.json`) |
| CloudTrail logging | ✅ Code (`relay-audit`). Confirm "Logging: On" |
| Budget + alarm emails confirmed | You: click the SNS confirmation email (needs a real `alertEmail`) |
| Bedrock model invocation logging off | You (account setting; the stack doesn't turn it on) |
| App logs contain no patient data | You: sample `/relay/app` after testing |
| SMS templates reviewed by a clinician | You |
| Emergency pause rehearsed | You (CDK switch tested offline) |
| Restore from backup rehearsed | You |
| Breach response plan known | You |

## Commands run

| Command | Result |
|---|---|
| `git checkout -b review/pre-deploy-check origin/review/pre-deploy-check` | Pass |
| `cd infra && npm ci` | Pass (npm warned that install scripts for `esbuild`/`fsevents` weren't approved; this had no effect) |
| `npx cdk synth --no-lookups --quiet` (AWS config/credentials pointed at `/dev/null`, `CDK_DEFAULT_ACCOUNT=<relay-account-id>`, `CDK_DEFAULT_REGION=us-east-2`, so the committed `cdk.context.json` was used and no AWS call was possible) | Pass. Warnings for the 3 placeholders + blank `smsOriginationIdentity`, and "72 feature flags are not configured" (informational) |
| `cd infra && npm test` (7 CDK assertion tests) | Pass 7/7 |
| `cd infra && npm run build` (tsc) | Pass |
| `cfn-lint 1.46.0 --regions us-east-2` (throwaway venv, Python 3.9) | 0 real errors. 2× `E3002 Additional properties are not allowed ('Tags' was unexpected)` on the 2 ALB listeners, and `W3037 'sendrcsmessage' is not one of [...]`. Both are false positives from this older cfn-lint's out-of-date AWS schemas: 1.46.0 is the newest version that runs on Python 3.9, and CDK 2.277 only tags resources whose schema allows it. Also `W3691 Engine version '17' for engine 'postgres' is deprecated…` (see recommendation 5) and 4× W3005 (CDK's redundant DependsOn, harmless). **Re-run with a current cfn-lint on Python ≥ 3.10.** |
| `cfn-guard` | **Skipped**: needs a binary download or Rust toolchain, and no global installs were allowed |
| `cd relay-app && npm ci` | Pass |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 errors, 17 warnings) |
| `npm test` | Pass, 256/256 before changes, 260/260 after |
| `npm run build` | Pass with **no env vars at all** (none are needed at build time), on 16.2.6 and 16.4.6 |
| `npm run build:db-cli` | Pass |
| Standalone server smoke test, `NODE_ENV=production`, dummy non-secret Cognito/auth values | Pass (results above) |
| `npm audit --omit=dev` | On `main`: 26 findings (2 critical in next/proxy-addr). After the upgrade, Next's advisories are gone. Remaining: see recommendations 2–3 |
| Docker build | Not run (not required; Dockerfile reviewed by reading) |
| `git push origin review/pre-deploy-check` | **Failed**: `fatal: could not read Username for 'https://github.com': Device not configured` (no GitHub credentials in this environment). The commits exist only locally on this branch. |
