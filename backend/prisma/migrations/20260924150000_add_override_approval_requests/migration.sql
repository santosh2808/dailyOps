-- Real, blocking email approval for the three below-threshold overrides
-- (SalesOrder.dispatchOverride*, ProformaInvoice.advanceOverride*,
-- JobExecutionOrder.productionOverride*), replacing the old self-declare
-- dropdown. See OverrideApprovalRequest's schema comment.

-- CreateEnum
CREATE TYPE "OverrideApprovalType" AS ENUM ('SALES_ORDER_DISPATCH', 'PROFORMA_INVOICE_ADVANCE', 'JEO_PRODUCTION_START');

-- CreateEnum
CREATE TYPE "OverrideApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "OverrideApprovalRequest" (
    "id" TEXT NOT NULL,
    "type" "OverrideApprovalType" NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "proformaInvoiceId" TEXT,
    "actionPayload" JSONB NOT NULL,
    "advanceReceived" DOUBLE PRECISION NOT NULL,
    "requiredAdvance" DOUBLE PRECISION NOT NULL,
    "requestedByName" TEXT,
    "requestedByEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OverrideApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "publicToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "decidedApprover" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "resultError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverrideApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OverrideApprovalRequest_publicToken_key" ON "OverrideApprovalRequest"("publicToken");

-- CreateIndex
CREATE INDEX "OverrideApprovalRequest_salesOrderId_idx" ON "OverrideApprovalRequest"("salesOrderId");

-- CreateIndex
CREATE INDEX "OverrideApprovalRequest_proformaInvoiceId_idx" ON "OverrideApprovalRequest"("proformaInvoiceId");

-- CreateIndex
CREATE INDEX "OverrideApprovalRequest_status_idx" ON "OverrideApprovalRequest"("status");

-- AddForeignKey
ALTER TABLE "OverrideApprovalRequest" ADD CONSTRAINT "OverrideApprovalRequest_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideApprovalRequest" ADD CONSTRAINT "OverrideApprovalRequest_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: EmailHistory gains an optional link to the approval request
-- that triggered the "Approval Requested" / "Approved" / "Rejected" email.
ALTER TABLE "EmailHistory" ADD COLUMN "approvalRequestId" TEXT;

-- CreateIndex
CREATE INDEX "EmailHistory_approvalRequestId_idx" ON "EmailHistory"("approvalRequestId");

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "OverrideApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
