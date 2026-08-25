-- CreateEnum
CREATE TYPE "LeadHistoryAction" AS ENUM ('CREATED', 'EDITED', 'ASSIGNED', 'STATUS_CHANGED', 'QUOTATION_CREATED', 'CUSTOMER_CONVERTED');

-- CreateTable
CREATE TABLE "LeadHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "action" "LeadHistoryAction" NOT NULL,
    "description" TEXT NOT NULL,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAssignmentHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "previousUser" TEXT,
    "newUser" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "oldStatus" "LeadStatus",
    "newStatus" "LeadStatus" NOT NULL,
    "remarks" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadHistory_leadId_idx" ON "LeadHistory"("leadId");

-- CreateIndex
CREATE INDEX "LeadHistory_action_idx" ON "LeadHistory"("action");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_idx" ON "LeadNote"("leadId");

-- CreateIndex
CREATE INDEX "LeadAssignmentHistory_leadId_idx" ON "LeadAssignmentHistory"("leadId");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_leadId_idx" ON "LeadStatusHistory"("leadId");

-- AddForeignKey
ALTER TABLE "LeadHistory" ADD CONSTRAINT "LeadHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAssignmentHistory" ADD CONSTRAINT "LeadAssignmentHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
