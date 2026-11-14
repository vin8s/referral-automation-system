# Running Relay on your Mac

This guide gets Relay running on your computer with **fake data**. You don't
need a database, an AWS account or any passwords. Everything stays on your Mac.

> Tip: press **Cmd+Shift+V** in VS Code to view this file formatted.

---

## 1. Install Node.js (one time)

1. Go to <https://nodejs.org> and download the **LTS** version (22 or newer).
2. Open the downloaded `.pkg` file and click through the installer.
3. Open **Terminal** and check it worked:

   ```bash
   node --version
   ```

   You should see something like `v22.11.0`.

## 2. Install Relay's packages (one time, and after pulling new code)

In Terminal, go to the app folder and install:

```bash
cd ~/Documents/referral-automation-system/relay-app
npm install
```

## 3. Start Relay

```bash
npm run dev
```

Wait for `✓ Ready`, then open <http://localhost:3000> in your browser.

The first time it starts, Relay creates a small built-in database in
`relay-app/.data/` and fills it with fake patients. You'll see this in Terminal:

```
[db] applied migrations: 001_init.sql
[db] empty database seeded with fake data
```

To stop Relay, click the Terminal window and press **Ctrl+C**.

## 4. Sign in (mock login)

Locally there is no real login. The sign-in page shows two **fake staff users**:

| User | Role | Can do |
|---|---|---|
| Priya Anand | Medical Assistant (`ma`) | Everything except changing Settings |
| Alex Rivera | Administrator (`admin`) | Everything, including Settings |

Click one to sign in. To switch users, open the avatar menu (top right) or use
**Sign out** at the bottom of the sidebar.

Mock login only works in development. A production build refuses it, so the
real site always needs an Amazon Cognito login.

## 5. Things to know

- **Your changes are saved.** Confirming a slot, editing a referral and so on
  are written to the local database and survive restarts.
- **Relay is SMS-only.** There are no call buttons; outreach is by text. With
  `SMS_PROVIDER=mock` (the default) nothing leaves your computer, and each referral has a
  "Patient simulator (prototype)" box for replying as the patient.
- **Old local database?** If yours was seeded before 2026-11-14 it may still contain the
  old fake voice attempts (they're hidden now). Run `npm run db:reset` for the new
  SMS-only seed data.
- **Activity is audited.** Every change, and every time someone opens a
  referral, is recorded in the `audit_log` table with who did it.
- **Texting is simulated.** No real texts are sent and no AI service is called
  locally. Texts are saved in the database and shown on each referral.

### Try the texting demo (fake patients only)

1. Outreach runs by itself: right after referrals are imported, and every 5 minutes
   (`OUTREACH_AUTORUN_SECONDS`) for follow-ups. Fake patients with SMS consent get their
   first text automatically (only between 8 am and 8 pm, Monday–Saturday, clinic time).
   Set `OUTREACH_AUTORUN=off` in `.env.local` to stop automatic texting.
2. Open a referral (for example Grace Mwangi). The **Text messages** card shows the
   thread. In the **Patient simulator (prototype)** box, click the patient's date of
   birth chip, then **2**. The slot appears in **Confirm queue** as "SMS".
3. In **Confirm queue**, click **Confirm**. The referral becomes **Booked** and the
   patient gets the confirmation text.
4. Try **STOP**, **HELP** or **I can't breathe** in the simulator: STOP opts the
   patient out, HELP sends the help text, and the emergency phrase moves the
   referral to the red **Escalated** state and pauses texting.
5. **Pause all texting** (Settings) stops every outgoing text immediately.

## 6. Reset the local database

To throw away your changes and start again from the fake data:

1. Stop Relay (**Ctrl+C**).
2. Run:

   ```bash
   npm run db:reset
   ```

3. Start Relay again with `npm run dev`.

(Deleting the `relay-app/.data` folder also works; Relay rebuilds it on the next start.)

Always stop `npm run dev` before running `db:reset` or `db:seed`. The built-in
database can only be opened by one program at a time.

## 7. Optional: use a real local Postgres instead

You don't need this for normal work. It's useful when you want to practise
with the same kind of database AWS (RDS) uses.

1. Install **Postgres.app** from <https://postgresapp.com>, open it and click
   **Initialize**.
2. Create a database called `relay`:

   ```bash
   /Applications/Postgres.app/Contents/Versions/latest/bin/createdb relay
   ```

3. Create your settings file:

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and set:

   ```
   DATABASE_URL=postgres://localhost:5432/relay
   ```

4. Start Relay with `npm run dev`. It creates the tables and loads the fake data
   automatically. You can also run `npm run db:migrate` and `npm run db:seed` yourself.

To go back to the built-in database, delete or blank the `DATABASE_URL` line.

## 8. Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start Relay at http://localhost:3000 |
| `npm run db:reset` | Delete all data and reload the fake data |
| `npm run db:seed` | Load the fake data into an empty database |
| `npm run db:migrate` | Apply new database changes (`db/migrations/*.sql`) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Make a production build (needs Cognito settings to actually sign in) |

## Troubleshooting

- **`command not found: npm`**: Node isn't installed, or Terminal was open
  before you installed it. Close Terminal, open a new one and try again.
- **Port 3000 is in use**: another copy of Relay is running. Stop it, or run
  `npm run dev -- -p 3001` and open http://localhost:3001.
- **Database errors after pulling new code**: stop Relay, run `npm run db:reset`
  and start again.
- **Old Supabase settings in `.env.local`**: Relay no longer uses Supabase. You
  can delete any `NEXT_PUBLIC_SUPABASE_*` lines.
