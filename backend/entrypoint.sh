#!/bin/sh
# Container startup
set -e

echo "[entrypoint] 1/5 ensuring the application database exists"
npm run --silent db:ensure

echo "[entrypoint] 2/5 applying Prisma migrations"
npx prisma migrate deploy

echo "[entrypoint] 3/5 syncing the HVLS product catalogue"
npm run --silent seed:hvls-products

# First deploy only
if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] 4/5 RUN_SEED=true -> seeding departments, permissions, roles, admin"
  npm run --silent seed
else
  echo "[entrypoint] 4/5 RUN_SEED not set -> skipping seed (correct for normal deploys)"
fi

echo "[entrypoint] 5/5 seeding named sales resources"
npm run --silent seed:sales-resources

echo "[entrypoint] starting NestJS on port ${PORT:-4000}"
exec node dist/main.js