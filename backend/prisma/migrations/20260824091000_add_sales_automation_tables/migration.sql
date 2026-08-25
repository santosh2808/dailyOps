-- Sales Automation workflow: price validation fields, Send Quotation
-- tracking, and five new additive tables (EmailTemplate, EmailHistory,
-- ApprovalMatrix, QuotationApprovalRequest, AuditLog). Must run after
-- 20260824090000_add_sales_automation_enums (which adds the 'READY' /
-- LeadHistoryAction enum values referenced by nothing in this file, but
-- kept separate per that migration's own comment).

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "standardPrice" DOUBLE PRECISION,
                       ADD COLUMN "minPrice" DOUBLE PRECISION,
                       ADD COLUMN "maxDiscountPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "sentAt" TIMESTAMP(3),
                         ADD COLUMN "sentBy" TEXT,
                         ADD COLUMN "sentToEmail" TEXT;

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateTable
CREATE TABLE "EmailHistory" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "proformaInvoiceId" TEXT,
    "jobExecutionOrderId" TEXT,
    "templateKey" TEXT,
    "subject" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "ccEmails" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailHistory_quotationId_idx" ON "EmailHistory"("quotationId");

-- CreateIndex
CREATE INDEX "EmailHistory_salesOrderId_idx" ON "EmailHistory"("salesOrderId");

-- CreateIndex
CREATE INDEX "EmailHistory_proformaInvoiceId_idx" ON "EmailHistory"("proformaInvoiceId");

-- CreateIndex
CREATE INDEX "EmailHistory_jobExecutionOrderId_idx" ON "EmailHistory"("jobExecutionOrderId");

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_jobExecutionOrderId_fkey" FOREIGN KEY ("jobExecutionOrderId") REFERENCES "JobExecutionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ApprovalMatrix" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "minPercent" DOUBLE PRECISION NOT NULL,
    "maxPercent" DOUBLE PRECISION NOT NULL,
    "requiredRoleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalMatrix_module_idx" ON "ApprovalMatrix"("module");

-- AddForeignKey
ALTER TABLE "ApprovalMatrix" ADD CONSTRAINT "ApprovalMatrix_requiredRoleId_fkey" FOREIGN KEY ("requiredRoleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "QuotationApprovalRequest" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "discountPercent" DOUBLE PRECISION,
    "belowMinPrice" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionRemarks" TEXT,

    CONSTRAINT "QuotationApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationApprovalRequest_quotationId_idx" ON "QuotationApprovalRequest"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationApprovalRequest_status_idx" ON "QuotationApprovalRequest"("status");

-- AddForeignKey
ALTER TABLE "QuotationApprovalRequest" ADD CONSTRAINT "QuotationApprovalRequest_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT,
    "action" TEXT NOT NULL,
    "actorName" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_idx" ON "AuditLog"("recordId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
