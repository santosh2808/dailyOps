# Backend tests

- **Unit** (`test/unit/*.spec.ts`): services built with stubbed dependencies and a mocked Prisma. No database needed.
  `npm run test:unit` (also `npm test`)
- **Integration** (`test/integration/*.int-spec.ts`): plain `pg` against a disposable Postgres with all migrations applied. Skipped unless `DATABASE_URL` points to localhost/127.0.0.1 or a name containing `test`.
  ```bash
  docker run --rm -d --name dailyops-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dailyops_test -p 5433:5432 postgres:16
  export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/dailyops_test
  npx prisma migrate deploy        # or: node test/support/apply-migrations.js
  npm run test:int
  ```
- `npm run test:all` runs both.

CI (`.github/workflows/deploy.yml`, job `backend-tests`) runs typecheck, unit tests, `prisma migrate deploy` on a Postgres service container and the integration tests; the backend (and frontend) deploy jobs depend on it.

Limit: tests that drive Prisma Client against a real database are not included yet.
