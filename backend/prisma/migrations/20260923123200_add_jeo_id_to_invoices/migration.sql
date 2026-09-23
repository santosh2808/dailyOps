-- Feature: JEO-based tracking on invoices. Staff identify and search for
-- day-to-day paperwork by JEO number, not by Sales Order or invoice number,
-- so link ProformaInvoice and TaxInvoice directly to whichever
-- JobExecutionOrder was most recently linked to their Sales Order at the
-- moment the invoice was generated (see ProformaInvoicesService.create()
-- and TaxInvoicesService.create()). Nullable: a JEO may not exist yet when
-- an invoice is generated, and pre-existing invoice rows have no JEO to
-- backfill against, so they simply show NULL going forward.
ALTER TABLE "ProformaInvoice" ADD COLUMN "jeoId" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "jeoId" TEXT;

CREATE INDEX "ProformaInvoice_jeoId_idx" ON "ProformaInvoice"("jeoId");
CREATE INDEX "TaxInvoice_jeoId_idx" ON "TaxInvoice"("jeoId");

ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_jeoId_fkey"
  FOREIGN KEY ("jeoId") REFERENCES "JobExecutionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_jeoId_fkey"
  FOREIGN KEY ("jeoId") REFERENCES "JobExecutionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
