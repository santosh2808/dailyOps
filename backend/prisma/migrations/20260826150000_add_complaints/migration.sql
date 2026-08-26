-- Additive: Complaints module. Links to SalesOrder only — the customer and
-- any generated Proforma Invoice are reached through that one relation
-- (salesOrder.customer / salesOrder.proformaInvoices), see the Complaint
-- model's own schema comment.

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "complaintNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_complaintNumber_key" ON "Complaint"("complaintNumber");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_salesOrderId_idx" ON "Complaint"("salesOrderId");

-- CreateIndex
CREATE INDEX "Complaint_deletedAt_idx" ON "Complaint"("deletedAt");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
