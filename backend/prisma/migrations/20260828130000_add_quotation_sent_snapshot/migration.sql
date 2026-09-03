-- Frozen offer snapshot (items/prices/terms/notes/valid-until) captured at
-- Send time, so the customer's public link and PDF always match what was
-- actually emailed, even if the quotation is edited internally afterward.
-- Additive, nullable column — existing Quotation rows are unaffected (they
-- simply fall back to live data, see QuotationsService.resolveOfferContent).
ALTER TABLE "Quotation" ADD COLUMN "sentSnapshot" JSONB;
