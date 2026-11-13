# Relay Security Policy — [Clinic Name]

> **Not legal advice — have a lawyer review.** This is a short, practical policy for a small team. If [Clinic Name] is a HIPAA covered entity, it may need additional HIPAA policies (risk assessment, training records, etc.). A lawyer or compliance advisor should confirm what's required.

**Version:** 1.0   **Effective:** [Date]   **Policy owner:** [Owner name]   **Approved by:** [Clinic director]   **Next review:** [Date + 1 year]

## Purpose

Relay holds patient names, phone numbers, referrals and text messages. This policy says how we keep that information safe.

## 1. Who gets access

| Role | Who | Access |
|---|---|---|
| Admin | [Owner name], [one clinic admin] | Everything, including settings, user management, pause texting |
| MA / front desk | [Names] | Referrals, confirm queue, alerts, calendar |
| Clinician reviewer | [Name] | Read conversations for review |
| AWS account root | [Account owner] | Emergencies only; never daily use |

- Access only for people who need it for their job ("minimum necessary").
- The clinic director approves each new user. The admin keeps a list of users.

## 2. Logins and MFA

- **Everyone has their own login.** No shared accounts. No sharing passwords.
- **Multi-factor authentication (MFA) is required** for every Relay user and every AWS user (authenticator app preferred over text codes).
- Passwords: at least 12 characters, not reused from other sites. A password manager is recommended.
- AWS root user: MFA on, password stored securely, used only for account-level tasks.

## 3. Offboarding (when someone leaves)

| When | Do this | Who |
|---|---|---|
| Last day (or sooner) | Disable their Relay login | Admin |
| Same day | Remove AWS access if they had any; rotate any shared secrets they knew | Owner |
| Same day | Collect clinic devices, keys, printed Plan B lists | Clinic director |
| Within 1 week | Update the user list | Admin |

If the **owner** stops volunteering: hand over AWS account access and all documentation to the clinic, then remove the owner's access.

## 4. Devices and shared front-desk computers

- Use Relay only on **clinic computers** or devices the clinic approves.
- **Shared front-desk PCs:** each person logs in with their own account; **log out or lock the screen (Windows+L / Ctrl+Cmd+Q) every time you step away.** Set screens to lock after [5] minutes.
- Don't let the browser save Relay passwords on shared computers.
- Keep operating systems and browsers updated. Use the clinic's antivirus.
- Position screens so patients in the waiting area can't read them.
- Lost or stolen device with Relay access → tell the owner the same day (see `BREACH_RESPONSE.md`).

## 5. No patient data outside Relay and eCW

**Never put patient information (names, phone numbers, dates of birth, referral details, message text) in:**

- Email (unless the clinic confirms an approved secure email)
- Personal texts, WhatsApp, Slack or other chat apps
- Screenshots or phone photos of the screen
- **AI chat tools** (ChatGPT, Claude.ai, Gemini, etc.)
- Code repositories, bug reports, or the owner's development computer

Need to report a problem? Use the **referral ID** only (for example "REF-1042"), never the patient's name.

## 6. Data retention

| Data | Keep for | Then |
|---|---|---|
| Referral records and text conversations | [Retention period — **clinic/lawyer to set**; medical-record rules in [State] may apply] | Delete from Relay, or confirm they're stored in eCW |
| Uploaded eCW CSV files | Delete right after import | Deleted from computer Downloads and Relay storage |
| Audit logs (who did what) | [At least 6 years — **verify**] | Delete |
| Application logs (should contain no patient data) | [30–90] days | Auto-delete |
| Printed Plan B lists | 1 day | Shred |

## 7. Backups

- Database: automatic daily backups (Amazon RDS), encrypted, kept [7–35] days.
- The owner tests restoring a backup **once before launch and once per quarter**.
- Backups stay in the same AWS account under the BAA.

## 8. Technical safeguards (owner's checklist)

- [ ] Data encrypted at rest (RDS, backups) and in transit (HTTPS only)
- [ ] Only HIPAA-eligible AWS services used for patient data (see `VENDOR_BAA_TRACKER.md`)
- [ ] Every page and API requires login; nothing public
- [ ] Audit log records logins, confirms, state changes, pauses
- [ ] No patient data in application logs
- [ ] Billing alarms set
- [ ] Secrets in AWS Secrets Manager, not in code

## 9. Incidents

Anything that might expose patient data → follow `BREACH_RESPONSE.md` and tell [Owner] and [privacy contact] **the same day**.

## 10. Annual review

Once a year (or after any incident or big change): review this policy, the user list, the vendor/BAA tracker, and run a backup restore test.

| Review date | Reviewed by | Changes |
|---|---|---|
| | | |

## Acknowledgment

I have read this policy and will follow it.

| Name | Role | Signature | Date |
|---|---|---|---|
| | | | |
| | | | |
