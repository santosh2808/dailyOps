-- D.O.T. AI Lead Assistant — Phase 1 foundation. Additive only: new enum
-- types, new nullable/defaulted columns on the existing Lead table (every
-- existing row stays valid with no backfill needed), one new child table
-- (LeadAiCallLog) and one new singleton settings table (AiSettings). No
-- existing table/column is altered destructively and no data is deleted.
-- The matching ALTER TYPE ... ADD VALUE on the pre-existing LeadHistoryAction
-- enum is kept in its own migration (see
-- 20260910090100_add_ai_call_logged_history_action) per this project's
-- existing convention — Postgres cannot run ALTER TYPE ... ADD VALUE in the
-- same transaction as statements that might use the new value.

-- CreateEnum
CREATE TYPE "AiLeadStatus" AS ENUM ('NOT_STARTED', 'CALL_SCHEDULED', 'CALLING', 'ANSWERED', 'NO_ANSWER', 'CALLBACK_REQUESTED', 'QUALIFIED', 'NOT_QUALIFIED', 'NOT_INTERESTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiQualification" AS ENUM ('HOT', 'WARM', 'COLD', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('AUTO', 'ENGLISH', 'TELUGU', 'HINDI', 'KANNADA', 'TAMIL', 'MALAYALAM', 'MARATHI', 'GUJARATI', 'BENGALI');

-- CreateEnum
CREATE TYPE "LanguageSource" AS ENUM ('CUSTOMER', 'AI_DETECTED', 'STATE_DEFAULT', 'MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "preferredLanguage" "PreferredLanguage" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "languageSource" "LanguageSource" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "aiStatus" "AiLeadStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "aiQualification" "AiQualification",
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiCallAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAiCallAt" TIMESTAMP(3),
ADD COLUMN     "nextAiCallAt" TIMESTAMP(3),
ADD COLUMN     "aiSiteVisitRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiCallbackRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiCallbackAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_aiStatus_idx" ON "Lead"("aiStatus");

-- CreateTable
CREATE TABLE "LeadAiCallLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "externalCallId" TEXT,
    "status" "AiLeadStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "language" "PreferredLanguage",
    "qualification" "AiQualification",
    "summary" TEXT,
    "transcriptRef" TEXT,
    "recordingRef" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadAiCallLog_leadId_idx" ON "LeadAiCallLog"("leadId");

-- CreateIndex
CREATE INDEX "LeadAiCallLog_externalCallId_idx" ON "LeadAiCallLog"("externalCallId");

-- AddForeignKey
ALTER TABLE "LeadAiCallLog" ADD CONSTRAINT "LeadAiCallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "aiCallingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "callNewMarketingLeadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxCallAttempts" INTEGER NOT NULL DEFAULT 3,
    "callingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "callingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "defaultDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "supportedLanguages" "PreferredLanguage"[] NOT NULL DEFAULT ARRAY['ENGLISH', 'HINDI', 'TELUGU', 'KANNADA', 'TAMIL', 'MALAYALAM', 'MARATHI', 'GUJARATI', 'BENGALI']::"PreferredLanguage"[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
