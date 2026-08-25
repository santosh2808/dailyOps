-- Techno-Commercial Offer PDF template — Annexure-II commercial terms
-- (price basis, GST wording, transportation, payment, delivery, offer
-- validity, and an optional region/branch code used in quotationNumber)
-- turned out to vary per real quotation rather than being fixed
-- boilerplate. Additive, nullable JSON column — existing Quotation rows
-- are unaffected; the PDF renderer falls back to sensible defaults when
-- this is null.
ALTER TABLE "Quotation" ADD COLUMN "commercialTerms" JSONB;
