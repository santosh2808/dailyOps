# DailyOps – Database Backup & Restore

Scope: the PostgreSQL database used by the backend (Prisma). No secrets belong in this file; use the `DATABASE_URL` from your secret store.

> **Assumptions to verify.** The production database host and any automated backup/snapshot configuration are not described in this repository, so they are unverified. Confirm the items marked **[VERIFY]** against your actual hosting before relying on this document. Local development uses the `postgres:16-alpine` container in `docker-compose.yml` (volume `dailyops_pgdata`).

## 1. Key facts

- Migrations run automatically on every backend container start (`backend/entrypoint.sh` → `npx prisma migrate deploy`). **A deploy can change the schema, so take a backup before every deploy that includes a new folder under `backend/prisma/migrations`.**
- Uploaded files (site-visit photos, PO documents) are stored by the backend on disk, not in Postgres. **[VERIFY]** where that directory lives in production and whether it is on persistent storage; back it up separately from the database.
- Never run restore commands against production without a fresh backup and a second person's confirmation.

## 2. Backups

### 2.1 Managed snapshots (preferred) [VERIFY]
If the database is a managed service (e.g. AWS RDS/Aurora), enable automated backups with point-in-time recovery and a retention of at least 7–14 days, and take a manual snapshot immediately before risky deploys. Confirm the setting in the provider console.

### 2.2 Logical backup with pg_dump (works anywhere)

```bash
# Custom format: compressed, supports selective and parallel restore
export PGPASSWORD='<from secret store>'
pg_dump --host <host> --port 5432 --username <user> --dbname <dbname> \
  --format=custom --no-owner --no-privileges \
  --file "dailyops_$(date +%Y%m%d_%H%M%S).dump"
```

Local docker-compose equivalent:

```bash
docker exec dailyops-postgres pg_dump -U <user> -d <dbname> -Fc --no-owner \
  > "dailyops_$(date +%Y%m%d_%H%M%S).dump"
```

Recommendations:
- Run daily (cron / scheduled job) and before each deploy with migrations.
- Store copies off the database host (e.g. a private, versioned, encrypted S3 bucket); keep at least 14 daily and 3 monthly copies.
- Use the same or a newer `pg_dump` major version as the server (16).
- Record the dump file's checksum: `sha256sum <file>`.

## 3. Restore

### 3.1 Restore into a NEW database (always do this first)

```bash
createdb --host <host> --username <user> dailyops_restore
pg_restore --host <host> --username <user> --dbname dailyops_restore \
  --no-owner --no-privileges --exit-on-error dailyops_YYYYMMDD_HHMMSS.dump
```

Local docker-compose equivalent:

```bash
docker exec -i dailyops-postgres createdb -U <user> dailyops_restore
docker exec -i dailyops-postgres pg_restore -U <user> -d dailyops_restore --no-owner < file.dump
```

### 3.2 Verify the restored copy

```sql
-- compare against expectations from the live system
SELECT count(*) FROM "Quotation";
SELECT count(*) FROM "SalesOrder";
SELECT count(*) FROM "ProformaInvoice";
SELECT count(*) FROM "User";
SELECT max("createdAt") FROM "Quotation";   -- newest data present?
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL;  -- must be 0
```

Optionally point a staging backend at it (`DATABASE_URL=.../dailyops_restore`) and log in.

### 3.3 Production recovery (incident only)

1. Stop or scale down the backend so nothing writes during the restore.
2. Take a fresh backup of the current (damaged) state — it may still be needed.
3. Managed service: restore the snapshot / point-in-time to a new instance, verify (3.2), then repoint `DATABASE_URL` (secret) at it and redeploy. Prefer this over overwriting in place.
4. pg_dump route: restore into a new database (3.1), verify, then repoint `DATABASE_URL`. Overwriting in place requires dropping the database and is irreversible; do it only with a backup in hand.
5. Start the backend. On start it runs `prisma migrate deploy`, which applies any migrations newer than the restored data and does nothing otherwise.
6. Smoke test: login, open a quotation, sales order and proforma invoice, download a PDF.

## 4. Rolling back a bad migration
Prisma does not auto-rollback. If a deploy's migration fails or damages data: stop the service, restore the pre-deploy backup (3.3), redeploy the previous image (immutable tags are the commit SHA in ECR), and fix the migration in a new commit. Do not edit migrations that have already been applied in any environment.

## 5. Restore drill
Test the procedure at least quarterly: restore the latest backup into a scratch database, run section 3.2, record the elapsed time and any problems. A backup that has never been restored is unverified.

## 6. Test databases
Automated tests use a disposable database (CI Postgres service container, or a local one with a name containing `test`) — never a real environment. See `backend/test/README.md`.
