---
name: phone-test
description: Run a live Relay texting test to the owner's own iPhone. Starts Relay on port 3000 in AWS texting mode, opens the reply tunnel, points the AWS reply subscription at it, adds a test patient on the owner's verified phone, approves the first text, then follows the conversation as the owner replies. Use when the user says "phone test", "test with my phone", "text my iPhone", "rerun the test with my number", "send me a test text", or otherwise asks to try Relay's texting on their phone. Also use to check on, or shut down, a running phone test.
---

# Phone test (real texts to the owner's iPhone)

All the work is done by `relay-app/scripts/phone-test/phone-test.sh`. Run it from `relay-app/`.

## Privacy rules (always)
- The owner's phone number, the RCS agent ID and the SNS topic come from `docs/private/AWS_PRIVATE_IDS.md` (git-ignored). The script reads them itself.
- Never print the full phone number in chat, never put it in a tracked file, never commit `relay-app/.phone-test/`.
- Only the owner's phone is verified on the RCS test agent. AWS rejects every other number with `DESTINATION_PHONE_NUMBER_NOT_VERIFIED`. That is expected, not a bug to work around.

## Steps
1. **Start everything:** `scripts/phone-test/phone-test.sh up`
   - If it says the AWS sign-in expired, run `aws login --profile relay` (opens a browser; the user approves), then rerun `up`.
   - If the :3000 server is running but not in AWS mode, ask the user before stopping it (it may belong to another session).
   - It reuses a live tunnel, otherwise it starts a new one. It also removes dead SNS subscriptions and confirms the new one.
2. **Send the first text:** `scripts/phone-test/phone-test.sh send "<Name> Test" <MM/DD/YYYY>`
   - Pick a fresh test name each run (for example "Sam Test"). Tell the user the date of birth so they can answer the identity check.
   - Replies go to the referral that was texted most recently on that phone, so the new test patient takes over from older ones.
3. **Check the quiet-hours line it prints.** Relay only texts during the clinic's window (Mon–Sat 8 AM–8 PM Eastern by default, clamped to 8–20 in code). If the window is closed, the text is queued and goes out automatically when it opens. Don't change the window to force a send at night: that limit is a texting-law guardrail.
4. **Follow the conversation:** run `scripts/phone-test/phone-test.sh status` after the user says they replied (or watch with a Monitor loop on `status`). Report what Relay said back. When the patient picks a time, it shows up in the Confirm queue at http://localhost:3000.
5. **When the user is done testing:** `scripts/phone-test/phone-test.sh down` removes the SNS subscription and stops the tunnel and gate. It leaves the :3000 server running.

## Troubleshooting
- Many `[relay] sms send failed: ConflictException` lines in the server log usually come from demo patients (fake numbers), not the test. Pause those threads with `PATCH /api/referrals/<id>/sms {"paused":true}` as an admin.
- `CredentialsProviderError` in the server log means the AWS session expired while the server was running. Run `aws login --profile relay`. If sends still fail afterwards, restart the :3000 server (with the user's OK) and rerun `up`.
- No replies arriving: check `relay-app/.phone-test/tunnel.log` and rerun `up` (quick tunnels expire after a while).
- Logs: `relay-app/.phone-test/{server,gate,tunnel}.log`.
