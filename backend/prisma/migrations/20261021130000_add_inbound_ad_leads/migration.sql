-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'GOOGLE_ADS';

-- CreateEnum
CREATE TYPE "InboundLeadStatus" AS ENUM ('CREATED', 'DUPLICATE', 'FAILED');

-- CreateTable
CREATE TABLE "InboundLeadEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "InboundLeadStatus" NOT NULL,
    "leadId" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundLeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundLeadEvent_createdAt_idx" ON "InboundLeadEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundLeadEvent_provider_externalId_key" ON "InboundLeadEvent"("provider", "externalId");
