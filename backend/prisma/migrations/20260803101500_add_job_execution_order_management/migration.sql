-- CreateEnum
CREATE TYPE "JeoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "JeoStatus" AS ENUM ('PENDING', 'MATERIAL_READY', 'ASSEMBLY_STARTED', 'QC', 'READY_FOR_DISPATCH', 'COMPLETED');

-- CreateTable
CREATE TABLE "JobExecutionOrder" (
    "id" TEXT NOT NULL,
    "jeoNumber" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "priority" "JeoPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "JeoStatus" NOT NULL DEFAULT 'PENDING',
    "assignedTo" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecutionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionChecklist" (
    "id" TEXT NOT NULL,
    "jeoId" TEXT NOT NULL,
    "materialIssued" BOOLEAN NOT NULL DEFAULT false,
    "assemblyStarted" BOOLEAN NOT NULL DEFAULT false,
    "controllerInstalled" BOOLEAN NOT NULL DEFAULT false,
    "wiringCompleted" BOOLEAN NOT NULL DEFAULT false,
    "qcPassed" BOOLEAN NOT NULL DEFAULT false,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "readyForDispatch" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobExecutionOrder_jeoNumber_key" ON "JobExecutionOrder"("jeoNumber");

-- CreateIndex
CREATE INDEX "JobExecutionOrder_status_idx" ON "JobExecutionOrder"("status");

-- CreateIndex
CREATE INDEX "JobExecutionOrder_priority_idx" ON "JobExecutionOrder"("priority");

-- CreateIndex
CREATE INDEX "JobExecutionOrder_salesOrderId_idx" ON "JobExecutionOrder"("salesOrderId");

-- CreateIndex
CREATE INDEX "JobExecutionOrder_customerId_idx" ON "JobExecutionOrder"("customerId");

-- CreateIndex
CREATE INDEX "JobExecutionOrder_quotationId_idx" ON "JobExecutionOrder"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionChecklist_jeoId_key" ON "ProductionChecklist"("jeoId");

-- AddForeignKey
ALTER TABLE "JobExecutionOrder" ADD CONSTRAINT "JobExecutionOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionOrder" ADD CONSTRAINT "JobExecutionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecutionOrder" ADD CONSTRAINT "JobExecutionOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionChecklist" ADD CONSTRAINT "ProductionChecklist_jeoId_fkey" FOREIGN KEY ("jeoId") REFERENCES "JobExecutionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
