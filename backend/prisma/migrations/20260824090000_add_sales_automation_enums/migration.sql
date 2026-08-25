-- Sales Automation workflow: new enum values only, kept in their own
-- migration file (separate from the tables/columns migration that follows
-- it) because PostgreSQL cannot run ALTER TYPE ... ADD VALUE in the same
-- transaction as statements that might use the new value. No existing enum
-- value is removed or renamed.

-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'READY';

-- AlterEnum
ALTER TYPE "LeadHistoryAction" ADD VALUE 'QUOTATION_SENT';
ALTER TYPE "LeadHistoryAction" ADD VALUE 'SALES_ORDER_CREATED';
ALTER TYPE "LeadHistoryAction" ADD VALUE 'PROFORMA_INVOICE_GENERATED';
ALTER TYPE "LeadHistoryAction" ADD VALUE 'JEO_GENERATED';
