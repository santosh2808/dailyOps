-- WhatsApp Share: lazily-generated, non-expiring public PDF link tokens
-- for ProformaInvoice, TaxInvoice, and JobExecutionOrder, mirroring
-- Quotation.publicToken (20260827101000_add_quotation_acceptance_fields)
-- but without the expiry/snapshot/view-tracking/accept-reject columns
-- that workflow needed — these three are simple "open the PDF" links with
-- no negotiation step.

-- AlterTable
ALTER TABLE "ProformaInvoice" ADD COLUMN "publicToken" TEXT;

-- AlterTable
ALTER TABLE "TaxInvoice" ADD COLUMN "publicToken" TEXT;

-- AlterTable
ALTER TABLE "JobExecutionOrder" ADD COLUMN "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_publicToken_key" ON "ProformaInvoice"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_publicToken_key" ON "TaxInvoice"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecutionOrder_publicToken_key" ON "JobExecutionOrder"("publicToken");
