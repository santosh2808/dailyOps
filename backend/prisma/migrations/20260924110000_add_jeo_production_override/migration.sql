-- Production-start gate: generating a JEO now requires a minimum advance
-- (50% of the Sales Order's grandTotal, same MINIMUM_ADVANCE_PERCENT as the
-- existing dispatch gate and the Record Advance Payment minimum). Below the
-- minimum, one of the same two fixed named approvers (Santosh Kumar
-- Chegondi / Amarpal Gampa) may authorize an exception - mirrors
-- SalesOrder.dispatchOverride* and ProformaInvoice.advanceOverride*
-- exactly, but recorded as its own set of columns on JobExecutionOrder
-- since starting production is a third independent action.
-- AlterTable
ALTER TABLE "JobExecutionOrder" ADD COLUMN "productionOverrideNote" TEXT;
ALTER TABLE "JobExecutionOrder" ADD COLUMN "productionOverrideBy" TEXT;
ALTER TABLE "JobExecutionOrder" ADD COLUMN "productionOverrideAt" TIMESTAMP(3);
ALTER TABLE "JobExecutionOrder" ADD COLUMN "productionOverrideApprovedBy" TEXT;
