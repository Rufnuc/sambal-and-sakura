-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelCounted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cancelKind" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");

-- CreateIndex
CREATE INDEX "Order_status_cancelledAt_idx" ON "Order"("status", "cancelledAt");

