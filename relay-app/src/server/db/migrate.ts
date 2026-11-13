// Tiny migration runner: applies db/migrations/*.sql in filename order, once each.
// No 'server-only' import so scripts/db.ts can use it.

import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './driver';

export function migrationsDir(): string {
  return path.join(process.cwd(), 'db', 'migrations');
}

export async function runMigrations(db: Db): Promise<string[]> {
  await db.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )`);
  const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
  const applied = new Set(rows.map(r => r.name));

  const files = fs.readdirSync(migrationsDir()).filter(f => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
    await db.transaction(async tx => {
      await tx.exec(sql); // multi-statement script
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
