-- Lead re-engagement (self-relation). WON/LOST are hard-terminal — this
-- never reopens the old lead, it just optionally links a brand-new Lead
-- back to the closed one it's a re-engagement of, for traceability.
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "previousLeadId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_previousLeadId_idx" ON "Lead"("previousLeadId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_previousLeadId_fkey" FOREIGN KEY ("previousLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
