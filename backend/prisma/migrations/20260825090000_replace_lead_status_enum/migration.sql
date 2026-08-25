-- Lead Management Phase 1 — replace the LeadStatus enum wholesale.
--
-- Old: NEW, CONTACTED, QUALIFIED, SITE_VISIT, QUOTATION_SENT, NEGOTIATION,
--      WON, LOST, NOT_INTERESTED
-- New: NEW, ASSIGNED, CONTACTED, SITE_VISIT, QUALIFIED, QUOTATION_SENT,
--      WON, LOST
--
-- NEGOTIATION and NOT_INTERESTED no longer exist. Any existing rows using
-- them are remapped rather than dropped: NEGOTIATION -> QUOTATION_SENT
-- (a lead in negotiation already has a quotation out), NOT_INTERESTED ->
-- LOST (the closest surviving terminal status).
--
-- This is a plain CREATE TYPE + column swap (not ALTER TYPE ... ADD VALUE),
-- so — unlike the enum migration in 20260824090000_add_sales_automation_enums —
-- it's safe to both create and immediately use the new type within one
-- transaction/migration file.

ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "LeadStatus_new" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'SITE_VISIT', 'QUALIFIED', 'QUOTATION_SENT', 'WON', 'LOST');

ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus_new" USING (
  CASE "status"::text
    WHEN 'NEGOTIATION' THEN 'QUOTATION_SENT'
    WHEN 'NOT_INTERESTED' THEN 'LOST'
    ELSE "status"::text
  END
)::"LeadStatus_new";

ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- LeadStatusHistory.oldStatus / newStatus are also typed as LeadStatus.
ALTER TABLE "LeadStatusHistory" ALTER COLUMN "oldStatus" TYPE "LeadStatus_new" USING (
  CASE "oldStatus"::text
    WHEN 'NEGOTIATION' THEN 'QUOTATION_SENT'
    WHEN 'NOT_INTERESTED' THEN 'LOST'
    ELSE "oldStatus"::text
  END
)::"LeadStatus_new";

ALTER TABLE "LeadStatusHistory" ALTER COLUMN "newStatus" TYPE "LeadStatus_new" USING (
  CASE "newStatus"::text
    WHEN 'NEGOTIATION' THEN 'QUOTATION_SENT'
    WHEN 'NOT_INTERESTED' THEN 'LOST'
    ELSE "newStatus"::text
  END
)::"LeadStatus_new";

DROP TYPE "LeadStatus";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
