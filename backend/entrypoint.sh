#!/bin/sh
# Container startup
set -e

echo "[entrypoint] 1/3 ensuring the application database exists"
npm run --silent db:ensure

echo "[entrypoint] 2/3 applying Prisma migrations"
npx prisma migrate deploy

# First deploy only
if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] 3/3 RUN_SEED=true -> seeding departments, permissions, roles, admin"
  npm run --silent seed
else
  echo "[entrypoint] 3/3 RUN_SEED not set -> skipping seed (correct for normal deploys)"
fi

echo "[entrypoint] starting NestJS on port ${PORT:-4000}"
exec node dist/main.js
