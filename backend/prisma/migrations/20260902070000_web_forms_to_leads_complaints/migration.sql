-- CreateEnum
CREATE TYPE "ComplaintSource" AS ENUM ('INTERNAL', 'WEB_FORM', 'CONVERTED_FROM_LEAD');

-- CreateEnum
CREATE TYPE "WarrantyVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "ComplaintHistoryAction" AS ENUM ('CREATED', 'EDITED', 'STATUS_CHANGED', 'ASSIGNED', 'INVOICE_LINKED', 'CONVERTED_TO_LEAD', 'CONVERTED_FROM_LEAD');

-- CreateEnum
CREATE TYPE "ConversionDirection" AS ENUM ('LEAD_TO_COMPLAINT', 'COMPLAINT_TO_LEAD');

-- CreateEnum
CREATE TYPE "FormWebsiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FormDestinationType" AS ENUM ('LEAD', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "WebFormIntakeStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- DropForeignKey
ALTER TABLE "Complaint" DROP CONSTRAINT "Complaint_salesOrderId_fkey";

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "claimedInvoiceNumber" TEXT,
ADD COLUMN     "convertedToLeadId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "reporterEmail" TEXT,
ADD COLUMN     "reporterName" TEXT,
ADD COLUMN     "reporterPhone" TEXT,
ADD COLUMN     "source" "ComplaintSource" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "sourceSubjectCode" TEXT,
ADD COLUMN     "sourceWebsiteId" TEXT,
ADD COLUMN     "submittedData" JSONB,
ADD COLUMN     "taxInvoiceId" TEXT,
ADD COLUMN     "taxInvoiceItemId" TEXT,
ADD COLUMN     "warrantyVerificationStatus" "WarrantyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "webFormIntakeId" TEXT,
ALTER COLUMN "salesOrderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EmailHistory" ADD COLUMN     "complaintId" TEXT,
ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "convertedToComplaintId" TEXT,
ADD COLUMN     "sourceSubjectCode" TEXT,
ADD COLUMN     "sourceWebsiteId" TEXT,
ADD COLUMN     "webFormIntakeId" TEXT;

-- CreateTable
CREATE TABLE "TaxInvoiceItem" (
    "id" TEXT NOT NULL,
    "taxInvoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT,
    "productDescription" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintHistory" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "action" "ComplaintHistoryAction" NOT NULL,
    "description" TEXT NOT NULL,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadComplaintConversion" (
    "id" TEXT NOT NULL,
    "direction" "ConversionDirection" NOT NULL,
    "sourceLeadId" TEXT,
    "sourceComplaintId" TEXT,
    "targetLeadId" TEXT,
    "targetComplaintId" TEXT,
    "reason" TEXT,
    "convertedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadComplaintConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormWebsite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FormWebsiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "supportEmail" TEXT,
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormWebsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDefinition" (
    "id" TEXT NOT NULL,
    "formWebsiteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicFormKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEmail" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "formDefinitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormWebsiteProduct" (
    "id" TEXT NOT NULL,
    "formWebsiteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "fieldConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormWebsiteProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubjectRoute" (
    "id" TEXT NOT NULL,
    "formDefinitionId" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "destinationType" "FormDestinationType" NOT NULL,
    "productId" TEXT,
    "departmentId" TEXT,
    "assignedUserId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubjectRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebFormIntake" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "formWebsiteId" TEXT NOT NULL,
    "formDefinitionId" TEXT NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "message" TEXT NOT NULL,
    "submittedData" JSONB NOT NULL DEFAULT '{}',
    "classification" "FormDestinationType" NOT NULL,
    "leadId" TEXT,
    "complaintId" TEXT,
    "idempotencyKey" TEXT,
    "status" "WebFormIntakeStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebFormIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxInvoiceItem_taxInvoiceId_idx" ON "TaxInvoiceItem"("taxInvoiceId");

-- CreateIndex
CREATE INDEX "TaxInvoiceItem_productId_idx" ON "TaxInvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "ComplaintHistory_complaintId_idx" ON "ComplaintHistory"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintHistory_action_idx" ON "ComplaintHistory"("action");

-- CreateIndex
CREATE INDEX "LeadComplaintConversion_sourceLeadId_idx" ON "LeadComplaintConversion"("sourceLeadId");

-- CreateIndex
CREATE INDEX "LeadComplaintConversion_sourceComplaintId_idx" ON "LeadComplaintConversion"("sourceComplaintId");

-- CreateIndex
CREATE INDEX "LeadComplaintConversion_targetLeadId_idx" ON "LeadComplaintConversion"("targetLeadId");

-- CreateIndex
CREATE INDEX "LeadComplaintConversion_targetComplaintId_idx" ON "LeadComplaintConversion"("targetComplaintId");

-- CreateIndex
CREATE UNIQUE INDEX "FormWebsite_code_key" ON "FormWebsite"("code");

-- CreateIndex
CREATE INDEX "FormWebsite_status_idx" ON "FormWebsite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_publicFormKey_key" ON "FormDefinition"("publicFormKey");

-- CreateIndex
CREATE INDEX "FormDefinition_formWebsiteId_idx" ON "FormDefinition"("formWebsiteId");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_formWebsiteId_code_key" ON "FormDefinition"("formWebsiteId", "code");

-- CreateIndex
CREATE INDEX "FormVersion_formDefinitionId_idx" ON "FormVersion"("formDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersion_formDefinitionId_version_key" ON "FormVersion"("formDefinitionId", "version");

-- CreateIndex
CREATE INDEX "FormWebsiteProduct_formWebsiteId_idx" ON "FormWebsiteProduct"("formWebsiteId");

-- CreateIndex
CREATE INDEX "FormWebsiteProduct_productId_idx" ON "FormWebsiteProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "FormWebsiteProduct_formWebsiteId_productId_key" ON "FormWebsiteProduct"("formWebsiteId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "FormWebsiteProduct_formWebsiteId_publicCode_key" ON "FormWebsiteProduct"("formWebsiteId", "publicCode");

-- CreateIndex
CREATE INDEX "FormSubjectRoute_formDefinitionId_subjectCode_idx" ON "FormSubjectRoute"("formDefinitionId", "subjectCode");

-- CreateIndex
CREATE INDEX "FormSubjectRoute_productId_idx" ON "FormSubjectRoute"("productId");

-- CreateIndex
CREATE INDEX "FormSubjectRoute_departmentId_idx" ON "FormSubjectRoute"("departmentId");

-- CreateIndex
CREATE INDEX "FormSubjectRoute_assignedUserId_idx" ON "FormSubjectRoute"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WebFormIntake_referenceNumber_key" ON "WebFormIntake"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WebFormIntake_leadId_key" ON "WebFormIntake"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WebFormIntake_complaintId_key" ON "WebFormIntake"("complaintId");

-- CreateIndex
CREATE INDEX "WebFormIntake_formWebsiteId_createdAt_idx" ON "WebFormIntake"("formWebsiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebFormIntake_formDefinitionId_createdAt_idx" ON "WebFormIntake"("formDefinitionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebFormIntake_status_idx" ON "WebFormIntake"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WebFormIntake_formDefinitionId_idempotencyKey_key" ON "WebFormIntake"("formDefinitionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_webFormIntakeId_key" ON "Complaint"("webFormIntakeId");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_convertedToLeadId_key" ON "Complaint"("convertedToLeadId");

-- CreateIndex
CREATE INDEX "Complaint_source_idx" ON "Complaint"("source");

-- CreateIndex
CREATE INDEX "Complaint_sourceWebsiteId_idx" ON "Complaint"("sourceWebsiteId");

-- CreateIndex
CREATE INDEX "Complaint_assignedToUserId_idx" ON "Complaint"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Complaint_departmentId_idx" ON "Complaint"("departmentId");

-- CreateIndex
CREATE INDEX "Complaint_taxInvoiceId_idx" ON "Complaint"("taxInvoiceId");

-- CreateIndex
CREATE INDEX "EmailHistory_leadId_idx" ON "EmailHistory"("leadId");

-- CreateIndex
CREATE INDEX "EmailHistory_complaintId_idx" ON "EmailHistory"("complaintId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_webFormIntakeId_key" ON "Lead"("webFormIntakeId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedToComplaintId_key" ON "Lead"("convertedToComplaintId");

-- CreateIndex
CREATE INDEX "Lead_sourceWebsiteId_idx" ON "Lead"("sourceWebsiteId");

-- CreateIndex
CREATE INDEX "Lead_webFormIntakeId_idx" ON "Lead"("webFormIntakeId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceWebsiteId_fkey" FOREIGN KEY ("sourceWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedToComplaintId_fkey" FOREIGN KEY ("convertedToComplaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoiceItem" ADD CONSTRAINT "TaxInvoiceItem_taxInvoiceId_fkey" FOREIGN KEY ("taxInvoiceId") REFERENCES "TaxInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoiceItem" ADD CONSTRAINT "TaxInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: TaxInvoiceItem previously didn't exist — TaxInvoice/ProformaInvoice
-- read SalesOrder.items live. This copies each existing TaxInvoice's items
-- (via its SalesOrder) into permanent TaxInvoiceItem snapshot rows so no
-- pre-existing invoice loses its line items once the app starts reading
-- invoice.items instead of invoice.salesOrder.items. Idempotent (NOT EXISTS
-- guarded) so this migration is safe to run against any future non-dev
-- database too, not just this local reset. gen_random_uuid() needs pgcrypto,
-- which no prior migration in this project enables — enable it here rather
-- than assume it's already on.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "TaxInvoiceItem" ("id", "taxInvoiceId", "productId", "productName", "productSku", "productDescription", "quantity", "unitPrice", "discount", "tax", "lineTotal", "createdAt")
SELECT gen_random_uuid(), ti."id", soi."productId", p."name", p."sku", soi."description", soi."quantity", soi."unitPrice", soi."discount", soi."tax", soi."lineTotal", now()
FROM "TaxInvoice" ti
JOIN "SalesOrder" so ON so."id" = ti."salesOrderId"
JOIN "SalesOrderItem" soi ON soi."salesOrderId" = so."id"
JOIN "Product" p ON p."id" = soi."productId"
WHERE NOT EXISTS (SELECT 1 FROM "TaxInvoiceItem" existing WHERE existing."taxInvoiceId" = ti."id");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_sourceWebsiteId_fkey" FOREIGN KEY ("sourceWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_taxInvoiceId_fkey" FOREIGN KEY ("taxInvoiceId") REFERENCES "TaxInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_taxInvoiceItemId_fkey" FOREIGN KEY ("taxInvoiceItemId") REFERENCES "TaxInvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_convertedToLeadId_fkey" FOREIGN KEY ("convertedToLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintHistory" ADD CONSTRAINT "ComplaintHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComplaintConversion" ADD CONSTRAINT "LeadComplaintConversion_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComplaintConversion" ADD CONSTRAINT "LeadComplaintConversion_sourceComplaintId_fkey" FOREIGN KEY ("sourceComplaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComplaintConversion" ADD CONSTRAINT "LeadComplaintConversion_targetLeadId_fkey" FOREIGN KEY ("targetLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadComplaintConversion" ADD CONSTRAINT "LeadComplaintConversion_targetComplaintId_fkey" FOREIGN KEY ("targetComplaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDefinition" ADD CONSTRAINT "FormDefinition_formWebsiteId_fkey" FOREIGN KEY ("formWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormWebsiteProduct" ADD CONSTRAINT "FormWebsiteProduct_formWebsiteId_fkey" FOREIGN KEY ("formWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormWebsiteProduct" ADD CONSTRAINT "FormWebsiteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubjectRoute" ADD CONSTRAINT "FormSubjectRoute_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubjectRoute" ADD CONSTRAINT "FormSubjectRoute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubjectRoute" ADD CONSTRAINT "FormSubjectRoute_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubjectRoute" ADD CONSTRAINT "FormSubjectRoute_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebFormIntake" ADD CONSTRAINT "WebFormIntake_formWebsiteId_fkey" FOREIGN KEY ("formWebsiteId") REFERENCES "FormWebsite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebFormIntake" ADD CONSTRAINT "WebFormIntake_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebFormIntake" ADD CONSTRAINT "WebFormIntake_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebFormIntake" ADD CONSTRAINT "WebFormIntake_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebFormIntake" ADD CONSTRAINT "WebFormIntake_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

