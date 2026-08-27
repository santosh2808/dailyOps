-- CreateTable
CREATE TABLE "StateSeriesCode" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "seriesStart" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateSeriesCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StateSeriesCode_state_key" ON "StateSeriesCode"("state");
