-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "isConverted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN     "convertedAt" TIMESTAMP(3);
