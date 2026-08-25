-- Lead Management Phase 1 (requirement #8/#9) — a Quotation can now be
-- generated directly from a Lead, before it's converted to a Customer.
-- customerId becomes optional; leadId is new. Exactly one of the two is
-- expected to be set per row (enforced in QuotationsService.create(), not
-- here) — existing rows are unaffected since customerId simply stays
-- populated and leadId stays NULL for all of them.

ALTER TABLE "Quotation" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Quotation" ADD COLUMN "leadId" TEXT;

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Quotation_leadId_idx" ON "Quotation"("leadId");

-- Lead Management Phase 1 (requirement #5) — free-text reminder note
-- alongside the existing nextFollowUp/priority fields.
ALTER TABLE "Lead" ADD COLUMN "reminderNote" TEXT;
