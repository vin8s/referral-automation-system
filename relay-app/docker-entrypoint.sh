#!/bin/sh
# Container start-up for Relay on AWS ECS.
#  1. Builds DATABASE_URL from the RDS secret fields that ECS injects
#     (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) if it isn't set directly.
#  2. Applies pending database migrations (the "deploy step"), unless
#     MIGRATE_ON_START=false. Runs before the server accepts traffic, so a failed
#     migration stops the new version from going live and ECS keeps the old one.
#  3. Starts the Next.js standalone server.
# Never echo connection details: they contain the database password.
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL="$(node -e '
    const e = encodeURIComponent, p = process.env;
    process.stdout.write(`postgres://${e(p.DB_USER)}:${e(p.DB_PASSWORD)}@${p.DB_HOST}:${p.DB_PORT || 5432}/${e(p.DB_NAME || "relay")}`);
  ')"
  export DATABASE_URL
fi
unset DB_PASSWORD

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  node /app/scripts/db.mjs migrate
fi

exec node /app/server.js
