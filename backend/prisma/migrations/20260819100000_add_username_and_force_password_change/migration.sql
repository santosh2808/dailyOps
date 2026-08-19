-- AlterTable: additive columns only on User (existing columns untouched)
ALTER TABLE "User" ADD COLUMN     "username" TEXT;
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Backfill username for any pre-existing rows (e.g. users seeded by an
-- earlier version of this project) from the local part of their email,
-- before making the column NOT NULL/UNIQUE — same backfill-then-tighten
-- approach as the earlier add_enterprise_rbac migration's `updatedAt`.
UPDATE "User" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL;

-- Guard against two existing users backfilling to the same username (e.g.
-- two emails that happen to share a local part at different domains) by
-- appending part of their id to any duplicates, so the UNIQUE index below
-- never fails on real data.
UPDATE "User" u
SET "username" = u."username" || '_' || substr(u."id", 1, 8)
WHERE u."username" IN (
  SELECT "username" FROM "User" GROUP BY "username" HAVING COUNT(*) > 1
);

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
