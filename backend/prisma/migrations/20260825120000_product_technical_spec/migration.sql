-- Techno-Commercial Offer PDF template (branded Quotation, requirement:
-- replicate the customer-supplied Smart Rotamach / Spyro Fans quotation
-- template with per-fan-size technical specifications). Additive, nullable
-- JSON column — existing Product rows are unaffected (spec table just
-- renders blank until an Administrator fills it in via the Products screen).
ALTER TABLE "Product" ADD COLUMN "technicalSpec" JSONB;
