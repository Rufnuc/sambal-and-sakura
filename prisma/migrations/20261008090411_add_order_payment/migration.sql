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
    "etaMins" INTEGER NOT NULL DEFAULT 25,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentRef" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "fulfilment", "id", "notes", "pointsEarned", "postcode", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType") SELECT "address", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "fulfilment", "id", "notes", "pointsEarned", "postcode", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
