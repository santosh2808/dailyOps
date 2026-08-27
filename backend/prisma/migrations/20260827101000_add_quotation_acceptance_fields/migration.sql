-- Customer Quotation Acceptance workflow: secure public link, view
-- tracking, and acceptance/rejection details on Quotation. Must run after
-- 20260827100000_add_quotation_acceptance_enums (which adds the VIEWED /
-- QUOTATION_ACCEPTED / QUOTATION_REJECTED enum values, kept separate per
-- that migration's own comment).

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "publicToken" TEXT,
                         ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
                         ADD COLUMN "firstViewedAt" TIMESTAMP(3),
                         ADD COLUMN "lastViewedAt" TIMESTAMP(3),
                         ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
                         ADD COLUMN "acceptedAt" TIMESTAMP(3),
                         ADD COLUMN "acceptedByName" TEXT,
                         ADD COLUMN "acceptedByDesignation" TEXT,
                         ADD COLUMN "acceptanceComment" TEXT,
                         ADD COLUMN "rejectedAt" TIMESTAMP(3),
                         ADD COLUMN "rejectionReason" TEXT,
                         ADD COLUMN "rejectionComment" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_publicToken_key" ON "Quotation"("publicToken");
