-- QA feature (SC-011): Record Advance Payment now enforces a minimum (50%
-- of the Sales Order's grandTotal, same MINIMUM_ADVANCE_PERCENT as the
-- existing dispatch gate). Below the minimum, one of the same two fixed
-- named approvers (Santosh Kumar Chegondi / Amarpal Gampa) may authorize an
-- exception — mirrors SalesOrder.dispatchOverride* exactly, but recorded as
-- its own set of columns on ProformaInvoice since the advance and the
-- dispatch are two independent actions.
-- AlterTable
ALTER TABLE "ProformaInvoice" ADD COLUMN "advanceOverrideNote" TEXT;
ALTER TABLE "ProformaInvoice" ADD COLUMN "advanceOverrideBy" TEXT;
ALTER TABLE "ProformaInvoice" ADD COLUMN "advanceOverrideAt" TIMESTAMP(3);
ALTER TABLE "ProformaInvoice" ADD COLUMN "advanceOverrideApprovedBy" TEXT;
