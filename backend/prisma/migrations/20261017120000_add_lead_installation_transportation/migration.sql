-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "installationCharge" DOUBLE PRECISION,
ADD COLUMN "transportationCharge" DOUBLE PRECISION,
ADD COLUMN "customerTransport" BOOLEAN NOT NULL DEFAULT false;
