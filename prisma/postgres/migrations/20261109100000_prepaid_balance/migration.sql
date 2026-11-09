-- Prepaid balance (offered per customer, separate terms) and its ledger.
ALTER TABLE "User" ADD COLUMN "balanceStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN "balancePence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "balanceDiscountPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "balanceTermsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "balanceTermsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "balanceDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "balancePaid" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "BalanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "method" TEXT,
    "note" TEXT,
    "staffEmail" TEXT,
    "balanceAfterPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BalanceEntry_userId_createdAt_idx" ON "BalanceEntry"("userId", "createdAt");
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
