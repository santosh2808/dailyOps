-- Site Visit photo evidence (SiteVisitOutcomeDialog) -- files themselves
-- live on local disk (see LeadsService's LEAD_SITE_VISIT_PHOTOS_DIR), this
-- table only tracks the metadata needed to serve/list/delete them, same
-- "reference, not the blob" convention as LeadAiCallLog.recordingRef.
-- CreateTable
CREATE TABLE "LeadSiteVisitPhoto" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSiteVisitPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadSiteVisitPhoto_leadId_idx" ON "LeadSiteVisitPhoto"("leadId");

-- AddForeignKey
ALTER TABLE "LeadSiteVisitPhoto" ADD CONSTRAINT "LeadSiteVisitPhoto_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
