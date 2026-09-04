-- Per-fan color/hanging-structure pricing at quotation time (previously only
-- collected, unpriced, at JEO generation), plus Quotation-level Transport
-- Scope (Customer/Company) and a flag marking that entered item prices
-- already include installation/transportation/GST.
-- CreateEnum
CREATE TYPE "TransportScope" AS ENUM ('CUSTOMER_SCOPE', 'COMPANY_SCOPE');

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "color" TEXT,
ADD COLUMN     "colorCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hangingStructureType" "HangingStructureType",
ADD COLUMN     "pipeLength" TEXT,
ADD COLUMN     "hangingStructureCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "transportScope" "TransportScope" NOT NULL DEFAULT 'COMPANY_SCOPE',
ADD COLUMN     "pricesIncludeChargesAndGst" BOOLEAN NOT NULL DEFAULT false;
