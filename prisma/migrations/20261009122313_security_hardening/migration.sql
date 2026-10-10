-- AlterTable
ALTER TABLE "Reward" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Reward" ADD COLUMN "usedAt" DATETIME;

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WheelState" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastSpinAt" DATETIME NOT NULL,
    CONSTRAINT "WheelState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "props" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "fulfilment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "subtotal" REAL NOT NULL,
    "deliveryFee" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "voucherCode" TEXT,
    "address" TEXT,
    "postcode" TEXT,
    "notes" TEXT,
    "whenType" TEXT NOT NULL DEFAULT 'asap',
    "scheduledTime" TEXT,
    "scheduledAt" DATETIME,
    "etaMins" INTEGER NOT NULL DEFAULT 25,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentRef" TEXT,
    "paidAt" DATETIME,
    "payToken" TEXT,
    "idempotencyKey" TEXT,
    "printStatus" TEXT NOT NULL DEFAULT 'pending',
    "printAttempts" INTEGER NOT NULL DEFAULT 0,
    "printedAt" DATETIME,
    "printError" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "fulfilment", "id", "notes", "paidAt", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType") SELECT "address", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "fulfilment", "id", "notes", "paidAt", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
CREATE INDEX "Order_printStatus_idx" ON "Order"("printStatus");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("createdAt", "expiresAt", "id", "token", "userId") SELECT "createdAt", "expiresAt", "id", "token", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE INDEX "Booking_phone_date_idx" ON "Booking"("phone", "date");

-- CreateIndex
CREATE INDEX "Reward_userId_used_idx" ON "Reward"("userId", "used");
