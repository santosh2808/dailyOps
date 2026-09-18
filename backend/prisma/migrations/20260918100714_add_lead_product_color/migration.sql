-- Bug fix: "Generate Quotation" from a Qualified lead derives its Quotation
-- items straight from LeadProduct (see QuotationsService.create()), but
-- LeadProduct had no color field at all, and Generate Quotation is a
-- one-click action with no items-editor step of its own — so any lead with
-- a fan-type product always hit QuotationsService.computeTotals()'s
-- "a fan item needs a confirmed paint Color" guard, with nowhere in that
-- flow to actually supply one. Mirrors QuotationItem.color/colorCharge.
-- AlterTable
ALTER TABLE "LeadProduct" ADD COLUMN     "color" TEXT,
ADD COLUMN     "colorCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;
