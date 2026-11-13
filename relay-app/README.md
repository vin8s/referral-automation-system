# Relay app

Staff console for converting specialist referrals into booked appointments.
Next.js 16 (App Router) + Postgres. **Run it locally:** see
[`docs/LOCAL_DEV_SETUP.md`](../docs/LOCAL_DEV_SETUP.md) (`npm install && npm run dev`, no database install needed).

## How the pieces fit

```
Browser (client components)
  └─ src/lib/data.ts            the ONLY data seam: async functions → fetch('/api/...')
       └─ src/app/api/**/route.ts   route handlers: withAuth() → 401/403, input checks
            └─ src/server/*.ts      server-only repositories (SQL), audit writes
                 └─ src/server/db/  driver: pg (DATABASE_URL) or PGlite (dev)
src/proxy.ts                     first gate: signed-out pages → /login, /api/* → 401
src/app/(app)/layout.tsx         re-checks the session, renders the shell
```

| Path | What lives there |
|---|---|
| `db/migrations/NNN_name.sql` | Plain-SQL migrations, applied in order (`npm run db:migrate`; auto in dev) |
| `src/server/db/seed.ts` | Fake seed data, derived from `src/lib/mockData.ts` |
| `src/server/referrals.ts` | Referral/attempt/appointment/settings queries + audit log |
| `src/server/auth/` | Session cookie (jose), Cognito OIDC (openid-client), `withAuth`, `requireUser` |
| `src/server/config.ts` | Feature flags (`VOICE_ENABLED`) |
| `src/server/log.ts` | `logError()`: logs error class/code only, never patient data |
| `src/contexts/SessionContext.tsx` | `useSession()` → `{ user, isAdmin, voiceEnabled }` in client components |
| `.env.example` | Every environment variable, documented |

### Adding a feature (e.g. SMS, CSV import)

1. New table → add `db/migrations/002_<name>.sql` (never edit `001_init.sql`).
2. Queries → a new `src/server/<feature>.ts` (`import 'server-only'`), writing
   `audit_log` rows for every mutation with the acting user.
3. Endpoint → `src/app/api/<feature>/route.ts`, wrapped in `withAuth(...)`
   (`{ roles: ['admin'] }` for admin-only).
   Public webhooks (e.g. inbound SMS) must live under a path added to
   `PUBLIC_PATHS` in `src/proxy.ts` and verify the provider's signature themselves.
4. Screens call a new function in `src/lib/data.ts`, never `fetch` directly and never server code.

Rules: no patient data in `console.*`; fake data only until the BAA is signed;
roles are `ma` and `admin` (settings changes are admin-only).

## Production (AWS)

Deployed as a container on **ECS Fargate** behind an HTTPS load balancer, with a private RDS Postgres.
Infrastructure lives in [`../infra`](../infra) (AWS CDK); the beginner walkthrough is
[`docs/AWS_DEPLOYMENT_GUIDE.md`](../docs/AWS_DEPLOYMENT_GUIDE.md).

| File | Role |
|---|---|
| `next.config.ts` | `output: 'standalone'` (self-contained server for the image), security headers, `no-store` on `/api/*` |
| `Dockerfile` | Multi-stage build → small ARM64 image; bundles the RDS CA certificate and the migrations |
| `docker-entrypoint.sh` | Builds `DATABASE_URL` from `DB_*` vars, runs `node scripts/db.mjs migrate`, then `node server.js` |
| `src/app/manifest.ts`, `src/app/pwa/[file]/route.tsx` | Installable browser app (manifest + icons). No service worker, so nothing is cached offline |

`npm run build:db-cli` bundles `scripts/db.ts` into `dist-scripts/db.mjs` (used only by the Dockerfile).

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` ·
`npm run db:migrate` · `npm run db:seed` · `npm run db:reset`
