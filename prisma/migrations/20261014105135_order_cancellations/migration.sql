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
    "locale" TEXT NOT NULL DEFAULT 'en',
    "cancelReason" TEXT,
    "cancelKind" TEXT,
    "cancelledAt" DATETIME,
    "cancelCounted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "cancelReason", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "flags", "fulfilment", "id", "idempotencyKey", "locale", "notes", "paidAt", "payToken", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "printAttempts", "printError", "printStatus", "printedAt", "scheduledAt", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType") SELECT "address", "cancelReason", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "flags", "fulfilment", "id", "idempotencyKey", "locale", "notes", "paidAt", "payToken", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "printAttempts", "printError", "printStatus", "printedAt", "scheduledAt", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");
CREATE INDEX "Order_printStatus_idx" ON "Order"("printStatus");
CREATE INDEX "Order_status_cancelledAt_idx" ON "Order"("status", "cancelledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
