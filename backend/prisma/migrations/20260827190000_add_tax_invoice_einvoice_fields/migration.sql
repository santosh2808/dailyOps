-- AlterTable: GST e-invoicing (IRN + QR code) — entered manually after being
-- obtained from the government e-invoice portal/GSP for GST-registered
-- (B2B) customers. qrCodeImage stores the government-issued QR as a base64
-- data string, embedded on the printed Tax Invoice PDF as-is.
ALTER TABLE "TaxInvoice" ADD COLUMN "irn" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "ackNumber" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "ackDate" TIMESTAMP(3);
ALTER TABLE "TaxInvoice" ADD COLUMN "qrCodeImage" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "eInvoiceUpdatedBy" TEXT;
ALTER TABLE "TaxInvoice" ADD COLUMN "eInvoiceUpdatedAt" TIMESTAMP(3);
