-- Customer Quotation Acceptance workflow: new enum values only, kept in
-- their own migration file (separate from the columns migration that
-- follows it), same convention as 20260824090000_add_sales_automation_enums
-- — PostgreSQL cannot run ALTER TYPE ... ADD VALUE in the same transaction
-- as statements that might use the new value. No existing enum value is
-- removed or renamed.

-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'VIEWED';

-- AlterEnum
ALTER TYPE "LeadHistoryAction" ADD VALUE 'QUOTATION_ACCEPTED';
ALTER TYPE "LeadHistoryAction" ADD VALUE 'QUOTATION_REJECTED';
