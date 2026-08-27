-- AlterTable: Dispatch gate (advance-payment check override) on SalesOrder
ALTER TABLE "SalesOrder" ADD COLUMN "dispatchOverrideNote" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "dispatchOverrideBy" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "dispatchOverrideAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "TaxInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'CANCELLED');

-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedThrough" TEXT,
    "destination" TEXT,
    "termsOfDelivery" TEXT,
    "buyersOrderNo" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TaxInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_invoiceNumber_key" ON "TaxInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "TaxInvoice_status_idx" ON "TaxInvoice"("status");

-- CreateIndex
CREATE INDEX "TaxInvoice_salesOrderId_idx" ON "TaxInvoice"("salesOrderId");

-- CreateIndex
CREATE INDEX "TaxInvoice_customerId_idx" ON "TaxInvoice"("customerId");

-- CreateIndex
CREATE INDEX "TaxInvoice_fiscalYear_idx" ON "TaxInvoice"("fiscalYear");

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: EmailHistory gains an optional link to TaxInvoice
ALTER TABLE "EmailHistory" ADD COLUMN "taxInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "EmailHistory_taxInvoiceId_idx" ON "EmailHistory"("taxInvoiceId");

-- AddForeignKey
ALTER TABLE "EmailHistory" ADD CONSTRAINT "EmailHistory_taxInvoiceId_fkey" FOREIGN KEY ("taxInvoiceId") REFERENCES "TaxInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
