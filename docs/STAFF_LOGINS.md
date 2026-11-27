# Staff logins: how to add, fix, and remove Relay accounts

This page is for the **clinic owner / administrator**. It explains how people get into
Relay and what to do when something goes wrong. No programming needed.

**The short version**

- Nobody can sign themselves up. **You create every account** in AWS.
- The person gets an **email with a temporary password**. On their first sign-in they choose their
  own password and set up an **authenticator app** on their phone. After that, every sign-in is
  *email + password + 6-digit code from the app*.
- Each person must be in **one group**: `ma` (medical assistants / front desk) or `admin`
  (can change Settings). Someone in **no group can't get in**; they'll see
  "ask the clinic administrator".
- Forgot password → they fix it themselves from the sign-in page (a code is emailed).
  Lost phone → **you** reset their authenticator (below).

There's no user-management screen inside Relay on purpose: accounts live in Amazon Cognito,
the AWS login service, and you manage them in the AWS console.

---

## Where to find things

You need two values. They were printed at the end of `cdk deploy`, and are also in
**AWS console → CloudFormation → Stacks → `Relay` → Outputs**:

| Output | Looks like | Used for |
|---|---|---|
| `UserPoolId` | `us-east-2_AbC123xyz` | every command below |
| `AppUrl` | `https://relay.yourclinic.org` | the address staff open |

In the console, the user list is at **Amazon Cognito → User pools → `relay-staff` → Users**.
Make sure the Region in the top-right corner is **US East (Ohio) us-east-2**.

> **Commands without installing anything:** every `aws …` command on this page can be pasted into
> **AWS CloudShell** (the `>_` icon in the top bar of the AWS console). It's already signed in as you.
> Replace `us-east-2_XXXXXXXXX` with your `UserPoolId` and the email with the real one.

---

## 1. Create a staff login

### In the console (click path)

1. **Amazon Cognito → User pools → `relay-staff` → Users → Create user**.
2. **Invitation message:** choose **Send an email invitation**.
3. **Email address:** the person's work email. Tick **Mark email address as verified**
   (this is what lets "Forgot password" work for them).
4. **Temporary password:** choose **Generate a password**.
5. **Create user**.
6. Open the new user → **Group memberships → Add user to group** → pick **`ma`** or **`admin`** → **Add**.
   (Or: **Groups** tab → `ma` → **Add user to group**.)

### Or with one command (CloudShell)

```bash
POOL=us-east-2_XXXXXXXXX
EMAIL=maria.lopez@yourclinic.org

aws cognito-idp admin-create-user --region us-east-2 --user-pool-id "$POOL" \
  --username "$EMAIL" --desired-delivery-mediums EMAIL \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="Maria Lopez" \
&& aws cognito-idp admin-add-user-to-group --region us-east-2 --user-pool-id "$POOL" \
  --username "$EMAIL" --group-name ma
```

Use `--group-name admin` for an administrator. The `name` is what Relay shows in the top bar
and in the audit log; you can leave it out and Relay will show the email instead.

### What the staff member receives

An email from **no-reply@verificationemail.com** with the subject
**"Your Relay account for Rhode Island Free Clinic"**, containing:

- the Relay address (`AppUrl`),
- their username (their email address),
- a **temporary password**, valid for **3 days**,
- a short note that they'll pick a new password and set up an authenticator app
  (in English and Spanish).

Tell them to check their spam folder if it doesn't arrive within a few minutes.

---

## 2. What the first sign-in looks like (walk them through it)

Before they start, they should install an authenticator app on their phone:
**Google Authenticator**, **Microsoft Authenticator**, or any app that "scans a QR code
and shows 6-digit codes" (free from the App Store / Google Play).

1. Open the Relay address. It goes **straight to the clinic's sign-in page** (white and teal, showing the
   Rhode Island Free Clinic logo next to the Relay mark; the address bar shows `…auth.us-east-2.amazoncognito.com`.
   That's expected; it's Amazon's login service working for the clinic).
   **Prefer Spanish?** Open `<Relay address>/login?lang=es` once (bookmark it). The sign-in pages are then in
   Spanish, and the browser remembers it.
2. (Relay's own screen only appears when there's something to tell them: "You have been signed out",
   "signed out after inactivity", "no access yet", or a problem. It has a **Sign in again** button.)
3. Enter their **email** and the **temporary password** from the email.
4. **Choose a new password.** Rules: at least 12 characters, with an uppercase letter,
   a lowercase letter, a number and a symbol. It can't be one of their last 5 passwords.
5. **Set up the authenticator app:** the page shows a QR code. In the app, tap **+ / Add account →
   Scan a QR code**, point the camera at the screen, then type the 6-digit code the app shows.
   (If they can't scan, the page also offers the code as text to type into the app.)
6. They land on the Relay dashboard.

Install the app **before** starting: each step only waits a few minutes. If a page times out
("Something went wrong"), they open the Relay address again. If they had already
chosen their new password, they log in with the *new* one and are shown the QR code again.

**Every sign-in after that:** email → password → the current 6-digit code from the app.

**Sessions:** Relay signs people out automatically after **30 minutes without activity** and
after **8 hours** at most (one shift), and the next sign-in always asks for the password and code
again (important on shared clinic computers). **Sign out** in Relay also ends the AWS sign-in
session.

---

## 3. Fixing problems

### "My temporary password expired" / "I never got the email"

Resend the invitation (a new temporary password, valid 3 more days):

- **Console:** the user still shows status *Force change password*. Easiest is to **delete the user**
  and **create them again** (section 1).
- **CloudShell:**
  ```bash
  aws cognito-idp admin-create-user --region us-east-2 --user-pool-id "$POOL" \
    --username "$EMAIL" --message-action RESEND --desired-delivery-mediums EMAIL
  ```

### "I forgot my password"

They can do this themselves: **Sign in → Forgot your password?** → enter their email → a code arrives
by email → enter the code and a new password. (They still need their authenticator app afterwards.)

If that doesn't work (e.g. their email isn't marked verified), you can force a reset, which emails them a code:

```bash
aws cognito-idp admin-reset-user-password --region us-east-2 --user-pool-id "$POOL" --username "$EMAIL"
```

### "I lost / replaced my phone" (authenticator reset)

**Check it's really them first** (in person or by calling them back on a number you already have),
because this removes the second lock on their account.

```bash
aws cognito-idp admin-delete-software-token --region us-east-2 --user-pool-id "$POOL" --username "$EMAIL"
```

At their next sign-in, after the password, they'll be shown a new QR code to scan with the app on
their new phone. If they also forgot the password, run the password reset above too.

(If CloudShell says the command doesn't exist, it's an older AWS CLI; delete the user and create
them again instead.)

### "It says my account hasn't been given access to Relay"

They signed in fine but aren't in a group. Add them to `ma` or `admin` (section 1, step 6), then they
sign in again.

### Someone is locked out after many wrong attempts

Cognito temporarily blocks an account after repeated wrong passwords; waiting about 15 minutes clears it.
If they've forgotten the password, use **Forgot your password?**.

---

## 4. Change someone's role

- **Make an MA an admin:** add them to `admin` (they can stay in `ma`; `admin` wins).
- **Remove admin rights:** **Users →** the person **→ Group memberships →** select `admin` **→ Remove**.

```bash
aws cognito-idp admin-add-user-to-group      --region us-east-2 --user-pool-id "$POOL" --username "$EMAIL" --group-name admin
aws cognito-idp admin-remove-user-from-group --region us-east-2 --user-pool-id "$POOL" --username "$EMAIL" --group-name admin
```

Role changes take effect at their **next sign-in** (ask them to sign out and back in).

---

## 5. When someone leaves (do this the same day)

1. **Disable** the account. It stops any new sign-in immediately and is reversible:
   **Users →** the person **→ Actions → Disable user access**, or
   ```bash
   aws cognito-idp admin-disable-user --region us-east-2 --user-pool-id "$POOL" --username "$EMAIL"
   ```
2. A Relay session that's already open ends on its own within **30 minutes** of inactivity (8 hours at most).
   If you need them out *right now*, sign out the computer they were using, or rotate the
   `relay/auth-secret` in Secrets Manager and restart the app (signs **everyone** out).
3. Later, if you're sure, **delete** the user (**Actions → Delete user**, or `admin-delete-user`).
   Disabled-but-kept is fine too and keeps a record.

To bring someone back: **Actions → Enable user access** (`admin-enable-user`).

---

## 6. Limits and settings worth knowing

| Setting | Value | Why |
|---|---|---|
| Who can create accounts | Administrators only (no self sign-up) | Only clinic staff should have access to patient data |
| Temporary password | Valid 3 days, must be changed on first sign-in | An unused invitation can't be used weeks later |
| Password rules | 12+ characters, upper + lower + number + symbol; last 5 can't be reused | Strong but typeable |
| Second factor | Authenticator app, **required for everyone**; no text-message codes | Text codes can be stolen (SIM swap) and cost money |
| Forgot password | Code sent to the person's **verified email** | Self-service; no admin needed |
| Relay session | 30 min idle, 8 h maximum; every sign-in asks for password + code | HIPAA "automatic logoff"; shared computers |
| Sign-in emails | Sent by Amazon Cognito from `no-reply@verificationemail.com` | No email setup needed |
| **Email limit** | **50 emails per day** for the whole AWS account (resets 09:00 UTC) | Fine for ~5 staff (invitations + password resets). If you ever hit it, set up Amazon SES (see below) |
| Cost | Cognito "Essentials" plan: the first 10,000 monthly users are free | ~5 staff → $0 |

**If you outgrow the 50/day email limit, or want emails to come from your clinic's address:**
verify your domain or address in **Amazon SES** (us-east-2), request SES production access, then in
**Cognito → `relay-staff` → Authentication methods → Email configuration → Edit** choose
**Send email from Amazon SES**. (Ask your developer to make the same change in `infra/` so a later
deploy doesn't switch it back.)

**Changing what the invitation email says:** it's in `infra/lib/relay-stack.ts` (`invitationEmail`),
applied by `cdk deploy`. The clinic name comes from `relay:clinicLoginName` in `infra/cdk.json`.

**Changing the look of the sign-in page:** colors and the logo are set by `cdk deploy`
(`managedLoginSettings` and `infra/assets/cognito-form-logo.png`). You can also experiment in
**Cognito → `relay-staff` → Managed login → Styles → Edit**, but the next `cdk deploy` resets it.

---

## 7. Checklist (HIPAA)

- [ ] Every person has their **own** account (never share a login).
- [ ] Every account is in exactly one of `ma` / `admin` (admins: as few as possible).
- [ ] Leavers are disabled the same day (section 5).
- [ ] Once a quarter: **Users** list → anyone who shouldn't be there? Anyone still in *Force change password*
      after a week? Delete them.
- [ ] Lost-phone resets only after confirming the person's identity.
