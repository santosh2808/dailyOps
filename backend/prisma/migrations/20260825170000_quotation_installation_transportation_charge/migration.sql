-- Real currency amounts for installation and transportation, feeding into
-- Quotation.grandTotal (previously these only existed as descriptive text
-- inside commercialTerms, e.g. "Included" / "Extra at actual" — no actual
-- number was ever added to the price calculation). Additive, defaulted to 0
-- so existing Quotation rows are unaffected; installationCharge is normally
-- auto-computed by QuotationsService (Rs.8,000 x total fan quantity) at
-- create/update time unless a quotation overrides it, while
-- transportationCharge has no default and is filled in per quotation by
-- staff based on site/distance.
ALTER TABLE "Quotation" ADD COLUMN "installationCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN "transportationCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
