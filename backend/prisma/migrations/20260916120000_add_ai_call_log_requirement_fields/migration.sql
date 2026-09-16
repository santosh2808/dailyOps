-- D.O.T. AI Lead Assistant — Phase 3A. Additive only: three new nullable
-- columns on the existing Lead table (quantity/application/timeline — the
-- structured requirement Meera will collect during a qualification call)
-- plus the matching per-call snapshot columns on LeadAiCallLog, mirroring
-- how qualification/summary are already kept both per-call and rolled up
-- onto Lead. No existing column is altered, no data is deleted, and every
-- existing Lead/LeadAiCallLog row stays valid with no backfill needed.
-- city/state are NOT duplicated here — the existing Lead.city/Lead.state
-- columns (added in an earlier migration) are reused directly instead.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "application" TEXT,
ADD COLUMN     "timeline" TEXT;

-- AlterTable
ALTER TABLE "LeadAiCallLog" ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "application" TEXT,
ADD COLUMN     "timeline" TEXT;
