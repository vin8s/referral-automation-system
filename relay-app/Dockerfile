# Production image for Relay (AWS ECS Fargate, ARM64 / Graviton).
# Built automatically by `cdk deploy` (see infra/ and docs/AWS_DEPLOYMENT_GUIDE.md).
# Local test (needs Docker Desktop):  docker build -t relay-app .
#
# Stages:
#   deps    install exact dependencies from package-lock.json
#   build   `next build` (output: 'standalone') + bundle the DB CLI (migrations)
#   run     small runtime image: standalone server, static files, migrations,
#           the AWS RDS CA bundle; runs as a non-root user

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:db-cli

FROM node:${NODE_VERSION}-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Amazon RDS certificate bundle, so the app can VERIFY the database's TLS
# certificate (DATABASE_SSL=verify + DATABASE_SSL_CA_FILE). Source:
# https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem

# Self-contained Next.js server (includes the traced node_modules, incl. pg).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Migrations + the bundled DB CLI (`node scripts/db.mjs migrate`).
COPY --from=build --chown=node:node /app/db/migrations ./db/migrations
COPY --from=build --chown=node:node /app/dist-scripts/db.mjs ./scripts/db.mjs
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 3000
# exec form → node receives SIGTERM directly and drains in-flight requests.
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
