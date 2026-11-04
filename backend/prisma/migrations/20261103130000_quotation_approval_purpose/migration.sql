-- Quotation approval requests can now be raised to SEND a quotation (its
-- pricing needs approval before the customer can accept it), as well as to
-- ACCEPT it internally (the original, and only, purpose until now — every
-- existing row keeps it via the default). pricingKey records the exact
-- prices that were approved, so an approval never covers prices changed
-- after it was requested. Both additive; no existing data is changed.
ALTER TABLE "QuotationApprovalRequest" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'ACCEPT';
ALTER TABLE "QuotationApprovalRequest" ADD COLUMN "pricingKey" TEXT;
