-- Follow-up reminder dedup flag (LeadFollowUpReminderService's daily
-- @Cron job) -- set once a reminder email/WhatsApp has actually gone out
-- for the lead's *current* nextFollowUp value, reset to NULL whenever
-- nextFollowUp itself changes (see LeadsService.create()/update()).
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "followUpReminderSentAt" TIMESTAMP(3);
