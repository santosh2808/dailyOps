-- AlterTable: User gets an optional phone number (Lead Assignment "+ Add User" modal field)
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- DropIndex: was on Lead.assignedTo, which is being replaced below
DROP INDEX "Lead_assignedTo_idx";

-- AlterTable: Lead.assignedTo (free text) -> Lead.assignedToUserId (FK to User)
ALTER TABLE "Lead" DROP COLUMN "assignedTo";
ALTER TABLE "Lead" ADD COLUMN "assignedToUserId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_assignedToUserId_idx" ON "Lead"("assignedToUserId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
