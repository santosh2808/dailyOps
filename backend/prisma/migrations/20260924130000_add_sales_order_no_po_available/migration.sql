-- Some customers won't issue a formal PO — staff can tick "No PO available"
-- instead of being blocked on customerPoNumber, as long as they record why
-- in noPoReason. No approval gate (unlike the dispatch/advance/production
-- override fields elsewhere on this table) — see
-- CreateSalesOrderDto.noPoAvailable's comment.
-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "noPoAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesOrder" ADD COLUMN "noPoReason" TEXT;
