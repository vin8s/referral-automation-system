// Low-level database driver selection.
//
//   DATABASE_URL set   → node-postgres (pg) Pool. Works with local Postgres and AWS RDS.
//   DATABASE_URL unset → embedded PGlite (Postgres compiled to WASM), stored in
//                        relay-app/.data/pglite. Development only — zero install.
//
// This file deliberately does NOT import 'server-only' so the CLI in
// scripts/db.ts can reuse it. App code must import from '@/server/db' instead.

import fs from 'node:fs';
import path from 'node:path';

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs a multi-statement SQL script with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  kind: 'pg' | 'pglite';
  /** Runs fn inside BEGIN/COMMIT; rolls back if fn throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function pgliteDir(): string {
  return process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pglite');
}

/** TLS options for pg. See .env.example (DATABASE_SSL, DATABASE_SSL_CA_FILE). */
function sslOptions(): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = (process.env.DATABASE_SSL || 'off').toLowerCase();
  const caFile = process.env.DATABASE_SSL_CA_FILE;
  if (mode === 'off' || mode === 'false' || mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false }; // encrypted, cert not verified
  // 'verify' (recommended for RDS): encrypted and the server certificate is checked.
  return {
    rejectUnauthorized: true,
    ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
  };
}

async function createPgDb(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: sslOptions(),
    max: Number(process.env.DATABASE_POOL_MAX || 5),
  });
  // Never log connection details or query parameters (they can contain patient data).
  pool.on('error', err => console.error('[db] idle client error:', (err as { code?: string }).code ?? err.name));

  return {
    kind: 'pg',
    async query<T>(text: string, params?: unknown[]) {
      const res = await pool.query(text, params as unknown[]);
      return { rows: res.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const tx: Queryable = {
          async query<R>(text: string, params?: unknown[]) {
            const res = await client.query(text, params as unknown[]);
            return { rows: res.rows as R[] };
          },
          async exec(sql: string) {
            await client.query(sql); // no params → simple protocol, multi-statement OK
          },
        };
        const out = await fn(tx);
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = pgliteDir();
  fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;

  return {
    kind: 'pglite',
    async query<T>(text: string, params?: unknown[]) {
      const res = await pg.query<T>(text, params as unknown[]);
      return { rows: res.rows };
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction(async tx =>
        fn({
          async query<R>(text: string, params?: unknown[]) {
            const res = await tx.query<R>(text, params as unknown[]);
            return { rows: res.rows };
          },
          async exec(sql: string) {
            await tx.exec(sql);
          },
        }),
      );
    },
    close: () => pg.close(),
  };
}

export async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return createPgDb(url);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL must be set in production (the embedded dev database is development-only).');
  }
  return createPgliteDb();
}
