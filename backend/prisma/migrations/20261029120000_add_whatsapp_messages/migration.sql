-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "campaignName" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppMessage_documentId_useCase_destination_createdAt_idx" ON "WhatsAppMessage"("documentId", "useCase", "destination", "createdAt");
