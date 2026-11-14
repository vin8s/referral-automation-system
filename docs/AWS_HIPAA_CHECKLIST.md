# Relay — AWS HIPAA Checklist

> **Not legal advice.** This lists how Relay's AWS setup lines up with the AWS BAA and common HIPAA
> safeguards. Have the clinic's lawyer / privacy officer review it. Under the AWS shared-responsibility model,
> AWS secures the cloud; **we** are responsible for how we configure and use it.

**Source checked:** [AWS HIPAA Eligible Services Reference](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)
(page "Last Updated: October 15, 2026"), checked **2026-11-13**. Re-check it before go-live and whenever a service is added.
Infrastructure definition: `infra/lib/relay-stack.ts`. Deployment steps: `docs/AWS_DEPLOYMENT_GUIDE.md`.

## The BAA

| Item | Status | Notes |
|---|---|---|
| AWS Business Associate Addendum accepted in **AWS Artifact** | ⬜ Not yet (no account yet) | Guide Part 1, step 4. Record the date in `docs/clinic/VENDOR_BAA_TRACKER.md`. Covers only HIPAA-eligible services. |
| Clinic ↔ owner agreement (BAA or volunteer confidentiality) | ⬜ | See `VENDOR_BAA_TRACKER.md`. |
| Account owned by the clinic (Route A) or owner's LLC (Route B) | ⬜ | `CLINIC_LAUNCH_PLAN.md` Phase 1. |

## Services

"PHI?" = whether the service stores or processes protected health information in Relay's design.

| Service | What Relay uses it for | PHI? | HIPAA eligible? | Encryption | Logging / audit | Backups | Access |
|---|---|---|---|---|---|---|---|
| **Amazon ECS on AWS Fargate** | Runs the Relay container | Yes (in memory) | ✅ Yes ("Amazon ECS"; "AWS Fargate – ECS and EKS engines only") | TLS in transit (ALB → task over the VPC; app → AWS APIs over HTTPS); Fargate ephemeral storage encrypted by AWS | App logs → CloudWatch `/relay/app` (no patient data by design: `src/server/log.ts`) | Stateless (image in ECR) | Task role: only `sms-voice:SendTextMessage` + `bedrock:InvokeModel*`; inbound only from the ALB security group |
| **Elastic Load Balancing (ALB)** | HTTPS front door | Yes (in transit) | ✅ Yes | TLS 1.2/1.3 (`RECOMMENDED_TLS` policy), HTTP → HTTPS redirect, ACM certificate; invalid headers dropped | Access logs → S3 (365 days) | n/a | Public on 80/443 only |
| **Amazon RDS for PostgreSQL** | Database | **Yes** | ✅ Yes (PostgreSQL engine listed) | At rest: KMS key `alias/relay-data`; in transit: `rds.force_ssl=1`, app verifies the RDS CA (`DATABASE_SSL=verify`) | CloudTrail for admin actions; Postgres logs not exported (avoids PHI in logs) | Automated daily backups, 14 days + point-in-time restore; final snapshot on delete; deletion protection on | **Not publicly accessible**; isolated subnets with no internet route; security group allows only the app |
| **Amazon Cognito** | Staff login | Staff identities only | ✅ Yes | AWS-managed | Sign-in events in CloudTrail; app writes `audit_log` rows | AWS-managed; pool retained on teardown | No self sign-up; **MFA required** (authenticator app, no SMS); 12+ char passwords (all classes, last 5 not reused); temp passwords expire in 3 days; groups `admin` / `ma`; Relay session 30 min idle / 8 h max (automatic logoff). User management: `docs/STAFF_LOGINS.md` |
| **Amazon Bedrock** (Claude) | Writes SMS reply drafts | **Yes** (message text) | ✅ Yes | TLS; Bedrock doesn't use prompts to train models | CloudTrail (model invocation logging **off**, so prompts aren't stored) | n/a | Task role limited to Anthropic Claude models / inference profiles |
| **AWS End User Messaging SMS** | Sends/receives texts | **Yes** (phone + text) | ✅ Yes ("Amazon Pinpoint and End User Messaging"; voice + WhatsApp excluded; we use SMS only) | TLS to AWS; **SMS over carrier networks is not encrypted** → no medical details in texts (`docs/SMS_TEMPLATES.md`) | CloudTrail | n/a | Registered clinic number; consent + STOP handling |
| **Amazon SNS** | Delivers inbound texts to Relay | **Yes** | ✅ Yes | Topic encrypted with KMS key; HTTPS-only delivery; `enforceSSL` | Delivery failures → SQS dead-letter queue + alarm | n/a | Topic policy: only End User Messaging (same account) may publish |
| **Amazon SQS** | Dead-letter queue for undelivered inbound texts | **Yes** | ✅ Yes ("Amazon Simple Queue Service") | KMS key; SSL enforced | Alarm when non-empty | Messages kept 14 days | Account-only |
| **AWS Lambda** | Outreach tick caller | No (sends a token, reads only the HTTP status) | ✅ Yes | Env vars encrypted with KMS key | `/relay/outreach-tick` (status code only) | n/a | Can only read the outreach token secret |
| **Amazon EventBridge Scheduler** | Triggers the outreach tick | No | ⚠️ "Amazon EventBridge" is listed; **Scheduler is not named separately** | n/a | CloudTrail | n/a | Invokes only the tick Lambda. Carries **no PHI**, so this is acceptable either way (services not on the list may be used if they don't touch PHI) |
| **AWS Secrets Manager** | DB password, session key, Cognito client secret, cron token | No (keys only) | ✅ Yes | KMS key | CloudTrail records every read | AWS-managed | Read only by the ECS execution role and the tick Lambda |
| **AWS KMS** | Encryption key for data at rest | No | ✅ Yes | Automatic yearly key rotation; key retained on teardown | CloudTrail | n/a | Key policy: account + the services that need it |
| **Amazon CloudWatch / CloudWatch Logs** | Logs, alarms | Should be **No** | ✅ Yes | Log groups encrypted with KMS key | Retention 1 year | n/a | Admins only. Code rule: no patient data in logs |
| **AWS CloudTrail** | Audit log of all AWS account activity | No | ✅ Yes | S3 (SSE-S3), log file validation on | Multi-region trail; kept ~6 years | Versioned bucket | Admins only |
| **Amazon S3** | CloudTrail + ALB access logs | No (URLs/IDs only) | ✅ Yes ("Amazon Simple Storage Service") | SSE-S3; SSL enforced; public access blocked | — | Versioning (CloudTrail bucket) | Admins only |
| **Amazon ECR** | Stores the app container image | No | ✅ Yes | AWS-managed | — | — | CDK bootstrap roles |
| **AWS Certificate Manager** | HTTPS certificate | No | ✅ Yes | — | — | Auto-renewed | — |
| **Amazon Route 53** | Domain / DNS | No | ✅ Yes | — | — | — | — |
| **Amazon VPC** | Private network | Carries PHI in transit | ✅ Yes | — | Flow logs (rejected traffic) → CloudWatch | — | DB in isolated subnets; no NAT gateway |
| **AWS IAM Identity Center** | Admin logins to AWS | No | ✅ Yes | — | CloudTrail | — | MFA every sign-in |
| **AWS Budgets** | Cost alerts | No | ❌ Not listed | — | — | — | Fine: no PHI |
| **AWS Artifact** | Accepting the BAA | No | ❌ Not listed | — | — | — | Fine: no PHI |

**Not used, and why:** AWS Amplify Hosting (supports Next.js only through v15 and can't reach a private database),
AWS App Runner (closed to new customers 2026-04-30; not on the eligible list), Amazon Lightsail (not eligible),
NAT Gateway (cost), WAF (optional later, ~$6+/month).

## Safeguards checklist (before real patients)

| ✅/⬜ | Check | How to verify |
|---|---|---|
| ⬜ | AWS BAA accepted and recorded | AWS Artifact → Agreements → Active |
| ⬜ | Root user has MFA, no access keys | IAM → Security credentials |
| ⬜ | Daily admin via IAM Identity Center with MFA | Identity Center → Settings → Authentication |
| ⬜ | Region is us-east-2 (Ohio) for everything (the project's home Region; other Regions are blocked by the organization's Region-restriction SCP) | Resource lists |
| ⬜ | Database not publicly accessible | RDS → Connectivity → *Publicly accessible: No* |
| ⬜ | Database encrypted, backups 14 days, deletion protection on | RDS → Configuration / Maintenance & backups |
| ⬜ | Only HTTPS reaches the app | `curl -I http://…` → 301 to https |
| ⬜ | All API routes need login | `curl …/api/referrals` → 401 (guide Part 7) |
| ⬜ | Staff MFA required; no self sign-up | Cognito → Sign-in → MFA *Required* |
| ⬜ | Every staff user is in exactly one group (`admin` / `ma`) | Cognito → Groups |
| ⬜ | Leavers disabled the same day; quarterly user review | Cognito → Users (`docs/STAFF_LOGINS.md` §5, §7) |
| ⬜ | Secrets only in Secrets Manager (nothing in `cdk.json`, git, or `.env` files on servers) | `git grep` / Secrets Manager list |
| ⬜ | CloudTrail logging | CloudTrail → Trails → `relay-audit` *Logging: On* |
| ⬜ | Budget + alarm emails confirmed | SNS → `relay-ops-alerts` → subscription *Confirmed* |
| ⬜ | Bedrock model invocation logging **off** (or, if turned on, to an encrypted, access-restricted destination) | Bedrock → Settings |
| ⬜ | Sample of app logs checked: no names, phone numbers or message text | CloudWatch Logs Insights on `/relay/app` |
| ⬜ | SMS templates reviewed by a clinician: no medical details | `docs/SMS_TEMPLATES.md` |
| ⬜ | Emergency "pause texting" rehearsed once | Guide Part 8 |
| ⬜ | Restore from backup rehearsed once (to a throw-away instance, then delete it) | RDS → Restore to point in time |
| ⬜ | Breach response plan known | `docs/clinic/BREACH_RESPONSE.md` |

## Known gaps / later improvements

- The app connects to Postgres as the RDS admin user (it also runs migrations). Later: a separate least-privilege
  app user and a migration-only user.
- The app task has a public IP for outbound calls (instead of a ~$33/month NAT gateway or ~$40+/month of VPC
  endpoints). Its security group accepts traffic only from the load balancer; all outbound calls are TLS to AWS APIs.
- No WAF in front of the load balancer (add AWS WAF managed rules if the site attracts abuse).
- Single-AZ database (pilot). Recovery = restore from backup (minutes to an hour). Multi-AZ doubles the DB cost.
