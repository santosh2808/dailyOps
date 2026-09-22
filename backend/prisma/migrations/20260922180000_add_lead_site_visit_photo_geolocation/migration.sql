-- Anti-fraud GPS capture for Site Visit photo evidence (user's own request:
-- "i dont want them to fraud me they visited"). latitude/longitude are
-- required — LeadsController rejects any upload missing either, so every
-- row from this point on carries a real GPS fix. This migration runs
-- immediately after the LeadSiteVisitPhoto table's own creation
-- (20260922174000_add_lead_site_visit_photo), so there is no pre-existing
-- data to backfill.
-- AlterTable
ALTER TABLE "LeadSiteVisitPhoto" ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "accuracyMeters" DOUBLE PRECISION;
