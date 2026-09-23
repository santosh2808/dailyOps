-- QA bug fix: "Quotation -> Sales Order" installation/transportation charge
-- breakdown was missing from the Sales Order creation preview, and after
-- creation the amounts were folded into grandTotal with no way to see them
-- broken out. The accepted Quotation's charges were already reaching the
-- final grandTotal (see SalesOrdersService.freezeToQuotationTotalsIfUnmodified),
-- but SalesOrder had no columns to store the split itself. Additive,
-- defaulted to 0 so existing Sales Order rows are unaffected (their
-- historical grandTotal already includes whatever charges applied at the
-- time; there is no way to retroactively split a pre-existing row's total
-- back into its components, so those rows will simply show 0/0 for these
-- two new fields going forward). New Sales Orders populate them directly
-- from the originating Quotation at create() time.
ALTER TABLE "SalesOrder" ADD COLUMN "installationCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN "transportationCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
