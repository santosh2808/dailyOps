-- Customer order tracking: the code in the /track/{token} link sent to the
-- customer on WhatsApp. Additive and nullable — existing Sales Orders are
-- untouched and get a token lazily the first time a link is needed.

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "trackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_trackingToken_key" ON "SalesOrder"("trackingToken");
