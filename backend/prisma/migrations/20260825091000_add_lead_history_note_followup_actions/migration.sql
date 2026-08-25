-- Lead Management Phase 1 (requirement #3) — two new LeadHistoryAction
-- values, written directly by LeadsService (addNote(), update()'s
-- follow-up branch) rather than synthesized at read time.
--
-- Kept in its own migration file, applied before anything that could use
-- these values, per Postgres's rule that ALTER TYPE ... ADD VALUE cannot
-- be used in the same transaction it runs in.

ALTER TYPE "LeadHistoryAction" ADD VALUE 'NOTE_ADDED';
ALTER TYPE "LeadHistoryAction" ADD VALUE 'FOLLOWUP_ADDED';
