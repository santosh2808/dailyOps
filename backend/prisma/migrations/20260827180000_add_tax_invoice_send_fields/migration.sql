-- AlterTable: Tax Invoice review-then-send flow (mirrors Quotation's
-- sentAt/sentBy/sentToEmail) — generating a Tax Invoice no longer emails it
-- automatically; these are stamped only when POST /tax-invoices/:id/send runs.
ALTER TABLE "TaxInvoice" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "TaxInvoice" ADD COLUMN "sentBy" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "sentToEmail" TEXT;
