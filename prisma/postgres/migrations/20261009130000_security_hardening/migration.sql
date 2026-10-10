-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "flags" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "payToken" TEXT,
ADD COLUMN     "printAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "printError" TEXT,
ADD COLUMN     "printStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "requiresCall" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelState" (
    "userId" TEXT NOT NULL,
    "lastSpinAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WheelState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsEntry_userId_status_idx" ON "PointsEntry"("userId", "status");

-- CreateIndex
CREATE INDEX "PointsEntry_orderId_idx" ON "PointsEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_orderId_key" ON "VoucherRedemption"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_group_phoneKey_key" ON "VoucherRedemption"("group", "phoneKey");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Event_name_createdAt_idx" ON "Event"("name", "createdAt");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE INDEX "Order_printStatus_idx" ON "Order"("printStatus");

-- CreateIndex
CREATE INDEX "Booking_phone_date_idx" ON "Booking"("phone", "date");

-- CreateIndex
CREATE INDEX "Reward_userId_used_idx" ON "Reward"("userId", "used");

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelState" ADD CONSTRAINT "WheelState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Orders that existed before print tracking must never be picked up by the print-retry worker.
UPDATE "Order" SET "printStatus" = 'not-needed';

-- Session tokens are now stored hashed, so existing sessions can't be matched: sign everyone out cleanly.
DELETE FROM "Session";

-- The old rate-limit / wheel bookkeeping rows moved to their own tables.
DELETE FROM "Setting" WHERE "key" LIKE 'ipreg:%' OR "key" LIKE 'wheel:%';

-- Points can never go negative, even if application code has a bug.
UPDATE "User" SET "points" = 0 WHERE "points" < 0;
ALTER TABLE "User" ADD CONSTRAINT "User_points_nonnegative" CHECK ("points" >= 0);
