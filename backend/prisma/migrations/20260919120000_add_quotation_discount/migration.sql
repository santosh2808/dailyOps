-- Flat, order-level discount on a Quotation (separate from any per-item
-- pricing) — mirrors SalesOrder.discount. Applied as a post-tax rebate in
-- QuotationsService.computeTotals() and shown on the PDF as its own
-- "Discount" row whenever non-zero. Defaults to 0, i.e. no change for any
-- existing quotation.
-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
