-- CreateEnum
CREATE TYPE "LeadReassignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "LeadReassignmentRequest" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromUserName" TEXT,
    "toUserId" TEXT,
    "toUserName" TEXT,
    "requestedBy" TEXT,
    "requestedByUserId" TEXT,
    "reason" TEXT,
    "status" "LeadReassignmentStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadReassignmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadReassignmentRequest_leadId_idx" ON "LeadReassignmentRequest"("leadId");

-- CreateIndex
CREATE INDEX "LeadReassignmentRequest_status_idx" ON "LeadReassignmentRequest"("status");

-- AddForeignKey
ALTER TABLE "LeadReassignmentRequest" ADD CONSTRAINT "LeadReassignmentRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
