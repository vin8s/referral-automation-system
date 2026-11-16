// Database CLI.  Usage (from relay-app/):
//   npm run db:migrate   apply new files in db/migrations
//   npm run db:seed      load fake data (only if the database has no referrals yet)
//   npm run db:reset     DELETE all data, then reload the fake data
//   npm run db:reset-empty  DELETE all data and leave the database empty (no fake patients)
//
// Uses DATABASE_URL if set (local Postgres / RDS), otherwise the embedded PGlite
// database in .data/pglite. Stop `npm run dev` first when using PGlite.

import { createDb } from '../src/server/db/driver';
import { runMigrations } from '../src/server/db/migrate';
import { seedIfEmpty, truncateAll } from '../src/server/db/seed';

async function main() {
  const cmd = process.argv[2];
  if (!['migrate', 'seed', 'reset', 'reset-empty'].includes(cmd)) {
    console.error('Usage: tsx scripts/db.ts <migrate|seed|reset|reset-empty>');
    process.exit(1);
  }
  if (cmd !== 'migrate' && process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed/reset fake data with NODE_ENV=production.');
    process.exit(1);
  }

  const db = await createDb();
  console.log(`Using ${db.kind === 'pg' ? 'Postgres (DATABASE_URL)' : 'embedded PGlite (.data/pglite)'}`);
  try {
    const ran = await runMigrations(db);
    console.log(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Migrations: already up to date');
    if (cmd === 'reset' || cmd === 'reset-empty') {
      await truncateAll(db);
      console.log('All data deleted.');
    }
    if (cmd === 'reset-empty') {
      console.log('Database is empty. `npm run dev` will not re-seed it unless SEED_FAKE_DATA=true.');
    }
    if (cmd === 'seed' || cmd === 'reset') {
      console.log((await seedIfEmpty(db)) ? 'Fake seed data loaded.' : 'Database already has data; seed skipped (use db:reset).');
    }
  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error('Database command failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
