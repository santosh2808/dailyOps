-- Free-text "Applicable To" note for spare-part Products (a standalone
-- motor/drive sold on its own) — e.g. "HVLS SPYRO 14" or "All HVLS Fans".
-- Additive, nullable column — existing Product rows are unaffected.
ALTER TABLE "Product" ADD COLUMN "applicableTo" TEXT;
