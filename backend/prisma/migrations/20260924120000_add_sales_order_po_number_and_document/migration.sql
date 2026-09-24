-- Purchase Order: the customer's own document confirming they're buying,
-- distinct from this Sales Order (Smart Rotamach's internal record of the
-- same commitment). customerPoNumber is required for every manually
-- created/edited Sales Order at the application layer (see
-- CreateSalesOrderDto.customerPoNumber) but left nullable here, same as
-- billingAddress/shippingAddress, to avoid a backfill for existing rows.
-- The customerPoDocument* columns are optional metadata for a single
-- uploaded scan/photo of the actual PO file, stored on disk (see
-- SalesOrdersService.uploadCustomerPoDocument()) — same "reference, not the
-- blob" convention as LeadSiteVisitPhoto.
-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoNumber" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentFileName" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentOriginalName" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentMimeType" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentSizeBytes" INTEGER;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentUploadedAt" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoDocumentUploadedBy" TEXT;
