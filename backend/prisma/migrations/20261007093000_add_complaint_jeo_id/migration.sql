-- QA fix ("Sales Order field should be replaced with JEO Number"): staff now
-- pick the Job Execution Order a complaint is about, not the Sales Order
-- directly — ComplaintsService.create() derives salesOrderId automatically
-- from jeo.salesOrderId. Nullable, same reasoning as Complaint.salesOrderId
-- itself: a web-form-originated complaint has neither a Sales Order nor a
-- JEO yet.
ALTER TABLE "Complaint" ADD COLUMN "jeoId" TEXT;

CREATE INDEX "Complaint_jeoId_idx" ON "Complaint"("jeoId");

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_jeoId_fkey"
  FOREIGN KEY ("jeoId") REFERENCES "JobExecutionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
