-- D.O.T. AI Lead Assistant — Phase 2A Telephony Test Foundation. Additive
-- only: one new enum type and one new table (TelephonyTestCall), plus a
-- nullable FK column + back-relation to the existing Lead table (Step 15 —
-- optional association only, no existing Lead column is touched). No
-- existing table/column is altered destructively and no data is deleted.

-- CreateEnum
CREATE TYPE "TelephonyTestCallStatus" AS ENUM ('NOT_STARTED', 'CALLING', 'RINGING', 'ANSWERED', 'COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER');

-- CreateTable
CREATE TABLE "TelephonyTestCall" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "leadId" TEXT,
    "status" "TelephonyTestCallStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "providerCallId" TEXT,
    "providerStatus" TEXT,
    "errorMessage" TEXT,
    "recordingRef" TEXT,
    "initiatedBy" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ringingAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyTestCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelephonyTestCall_leadId_idx" ON "TelephonyTestCall"("leadId");

-- CreateIndex
CREATE INDEX "TelephonyTestCall_providerCallId_idx" ON "TelephonyTestCall"("providerCallId");

-- CreateIndex
CREATE INDEX "TelephonyTestCall_status_idx" ON "TelephonyTestCall"("status");

-- AddForeignKey
ALTER TABLE "TelephonyTestCall" ADD CONSTRAINT "TelephonyTestCall_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
