-- D.O.T. AI Lead Assistant — Phase 1: new enum value only, kept in its own
-- migration (separate from 20260910090000_add_dot_ai_lead_foundation) because
-- PostgreSQL cannot run ALTER TYPE ... ADD VALUE in the same transaction as
-- statements that might use the new value. No existing enum value is
-- removed or renamed.

-- AlterEnum
ALTER TYPE "LeadHistoryAction" ADD VALUE 'AI_CALL_LOGGED';
