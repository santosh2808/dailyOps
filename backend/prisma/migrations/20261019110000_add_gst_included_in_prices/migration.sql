-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "gstIncludedInPrices" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "gstIncludedInPrices" BOOLEAN NOT NULL DEFAULT false;
