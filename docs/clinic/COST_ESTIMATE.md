# Cost Estimate — Relay SMS Pilot

> **These are rough estimates, not quotes.** Prices change and depend on region, usage and plan. **Verify every line in the AWS Pricing Calculator (calculator.aws)** and with the actual vendors before sharing numbers as final. Legal and insurance ranges are guesses — get real quotes.

**Last updated:** [Date]   **Prepared by:** [Owner name]

## Summary

| | Estimate |
|---|---|
| **Monthly (AWS, pilot)** | about **$65–75 / month** — possibly covered by nonprofit/startup credits (new AWS accounts get up to $200 in credits) |
| **One-time (legal, LLC, setup)** | about **$0–2,500** depending on route (plus insurance if the clinic requires it) |

## Monthly costs (pilot: 20–50 patients, SMS only)

Architecture (built by `infra/`, see `docs/AWS_DEPLOYMENT_GUIDE.md`): **ECS Fargate** container behind an
**Application Load Balancer** (HTTPS), **private RDS Postgres**, Cognito, Secrets Manager, Bedrock, End User
Messaging + SNS, EventBridge Scheduler + Lambda, CloudWatch, CloudTrail, KMS. No NAT gateway.
Priced for us-east-1 (Nov 2026); Relay deploys to us-east-2 (Ohio), where these services are priced the same or very close. **Estimates — verify in the calculator.**

| Item | Assumption | ≈ $/month | Pricing page |
|---|---|---|---|
| Application Load Balancer | 730 h × $0.0225 + minimal traffic (LCUs at $0.008/LCU-h) | 17–20 | [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| Public IPv4 addresses | 3 (2 for the ALB, 1 for the app task) × $0.005/h | 11 | [VPC pricing](https://aws.amazon.com/vpc/pricing/) |
| ECS Fargate (ARM/Graviton) | 0.25 vCPU ($0.0324/vCPU-h) + 1 GB ($0.00356/GB-h), always on | 8.50 | [Fargate pricing](https://aws.amazon.com/fargate/pricing/) |
| Amazon RDS Postgres db.t4g.micro | single-AZ, on-demand, ~$0.016/h (verify) | ~12 | [RDS Postgres pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| RDS storage | 20 GB gp3; backups up to 20 GB free | ~2.50 | same |
| Secrets Manager | 4 secrets × $0.40 | 1.60 | [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/) |
| AWS KMS | 1 customer key ($1) + requests | ~1 | [KMS pricing](https://aws.amazon.com/kms/pricing/) |
| CloudWatch | <1 GB logs, 6 alarms ($0.10 each), rejected-traffic flow logs | ~1.50 | [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) |
| Route 53 | hosted zone | 0.50 | [Route 53 pricing](https://aws.amazon.com/route53/pricing/) |
| ECR, S3 logs, CloudTrail | small images/logs; first management-event trail is free | <0.50 | [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/) |
| Amazon Cognito (Essentials) | < 10,000 monthly active users free | 0 | [Cognito pricing](https://aws.amazon.com/cognito/pricing/) |
| Lambda, EventBridge Scheduler, SNS, SQS | far below free allowances | ~0 | [Lambda](https://aws.amazon.com/lambda/pricing/) · [EventBridge](https://aws.amazon.com/eventbridge/pricing/) · [SNS](https://aws.amazon.com/sns/pricing/) |
| **Infrastructure subtotal** | | **≈ 56–60** | |
| Amazon Bedrock (Claude) | ~300 AI replies × ~3k input / 300 output tokens. Opus-class model; a Haiku-class model costs <$1 | 3–8 | [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) |
| AWS End User Messaging SMS | toll-free number $2/month + ~400 messages at ≈ $0.01 each incl. carrier fees (verify in the per-country price CSV) | 5–8 | [End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/) |
| **Total** | | **≈ $65–75** | |

**Why it's more than the first guess:** the original plan assumed Amplify (~$1–10). Amplify can't run Next.js 16
and can't reach a private database, so hosting is a load balancer + Fargate instead (~$37 with the IP addresses).
A NAT gateway (~$33 more) is deliberately avoided.

**Example SMS math (verify rates):** 50 patients × ~8 messages each (sent + received) = ~400 messages/month.
At about a cent per message including carrier fees, that's ~$4 plus the $2 number. 10DLC instead of toll-free:
$1/number + $2–10/campaign per month, plus $4.50 one-time brand registration (+ $41.50 optional vetting).

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
| eCW live interface (HL7/API) | Unknown — ask eCW rep; can be significant | |
| Compliance tools (Vanta/Drata) | Often thousands per year | Only if offering Relay to more clinics |

## Verified numbers (fill in after the AWS Pricing Calculator)

| Item | Verified monthly | Source / date |
|---|---|---|
| RDS | | |
| Load balancer + public IPs | | |
| ECS Fargate | | |
| Cognito | | |
| Bedrock | | |
| End User Messaging | | |
| Other | | |
| **Total** | | |

Calculator share link: ______________________
