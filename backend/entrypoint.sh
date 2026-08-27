#!/bin/sh
# Container startup
set -e

echo "[entrypoint] 1/4 ensuring the application database exists"
npm run --silent db:ensure

echo "[entrypoint] 2/4 applying Prisma migrations"
npx prisma migrate deploy

echo "[entrypoint] 3/4 syncing the HVLS product catalogue"
npm run --silent seed:hvls-products

# First deploy only. seed:sales-resources deliberately lives inside this same
# gate (not run unconditionally like seed:hvls-products above) because it
# seeds named Users (Rajesh, Rudra, Prathik, Vinita, Anirudh) rather than
# catalog data — running it on every restart would silently revert any
# name/department/role edit made to them later via the Users admin screen.
# It also depends on the Role/Department rows `npm run seed` creates, so it
# must run after it.
if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] 4/4 RUN_SEED=true -> seeding departments, permissions, roles, admin"
  npm run --silent seed
  echo "[entrypoint] 4/4 seeding named sales resources (Rajesh, Rudra, Prathik, Vinita, Anirudh)"
  npm run --silent seed:sales-resources
else
  echo "[entrypoint] 4/4 RUN_SEED not set -> skipping seed (correct for normal deploys)"
fi

echo "[entrypoint] starting NestJS on port ${PORT:-4000}"
exec node dist/main.js