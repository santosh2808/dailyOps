-- D.O.T. call-result write-back (Phase 0). Additive only: two new enum types
-- and nullable columns, no backfill, no change to existing rows or indexes.
--  * TelephonyTestCall.aiResult*: the voice-agent's result for a manual test
--    call, matched on providerCallId (Exotel CallSid). aiResultReceivedAt is
--    the idempotency marker for repeated submissions.
--  * LeadAiCallLog.fieldSuggestions: AI values that conflicted with existing
--    lead values and were therefore NOT written to the Lead.

-- CreateEnum
CREATE TYPE "VoiceAgentCallOutcome" AS ENUM ('CONVERSATION_COMPLETED', 'NO_CONVERSATION', 'AGENT_ERROR');

-- CreateEnum
CREATE TYPE "TelephonyResultLeadMatch" AS ENUM ('EXPLICIT_LEAD', 'SINGLE_MATCH', 'NO_MATCH', 'MULTIPLE_MATCHES', 'LEAD_UNAVAILABLE', 'EXPLICIT_LEAD_PHONE_MISMATCH');

-- AlterTable
ALTER TABLE "LeadAiCallLog" ADD COLUMN     "fieldSuggestions" JSONB;

-- AlterTable
ALTER TABLE "TelephonyTestCall" ADD COLUMN     "aiResult" JSONB,
ADD COLUMN     "aiResultLeadId" TEXT,
ADD COLUMN     "aiResultLeadMatch" "TelephonyResultLeadMatch",
ADD COLUMN     "aiResultOutcome" "VoiceAgentCallOutcome",
ADD COLUMN     "aiResultReceivedAt" TIMESTAMP(3);

