// The one database entry point for app code. Server-only: importing this from a
// Client Component is a build error, so the browser can never reach the database.

import 'server-only';
import { createDb, type Db } from './driver';
import { runMigrations } from './migrate';
import { seedIfEmpty } from './seed';

export type { Db, Queryable } from './driver';

// Cache on globalThis so dev hot-reloads and separate route bundles share ONE
// connection (important for PGlite, which must not be opened twice).
const g = globalThis as unknown as { __relayDb?: Promise<Db> };

async function init(): Promise<Db> {
  const db = await createDb();
  // Development: migrate + seed automatically so `npm run dev` just works.
  // Production: run `npm run db:migrate` as a deploy step instead.
  if (process.env.NODE_ENV !== 'production' || process.env.DB_AUTO_MIGRATE === 'true') {
    const ran = await runMigrations(db);
    if (ran.length) console.log(`[db] applied migrations: ${ran.join(', ')}`);
    if (process.env.NODE_ENV !== 'production' && (await seedIfEmpty(db))) {
      console.log('[db] empty database seeded with fake data');
    }
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__relayDb) {
    g.__relayDb = init().catch(err => {
      g.__relayDb = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return g.__relayDb;
}
