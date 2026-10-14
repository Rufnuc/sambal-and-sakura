-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "party" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "tableId" TEXT,
    "occasion" TEXT,
    "dietary" TEXT,
    "notes" TEXT,
    "requiresCall" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "date", "dietary", "email", "id", "name", "notes", "occasion", "party", "phone", "reminderSentAt", "requiresCall", "status", "tableId", "time", "userId") SELECT "createdAt", "date", "dietary", "email", "id", "name", "notes", "occasion", "party", "phone", "reminderSentAt", "requiresCall", "status", "tableId", "time", "userId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_date_idx" ON "Booking"("date");
CREATE INDEX "Booking_phone_date_idx" ON "Booking"("phone", "date");
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "translations" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);
INSERT INTO "new_Campaign" ("audience", "body", "createdAt", "createdBy", "failed", "finishedAt", "id", "sent", "status", "subject", "total") SELECT "audience", "body", "createdAt", "createdBy", "failed", "finishedAt", "id", "sent", "status", "subject", "total" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "cancelReason", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "flags", "fulfilment", "id", "idempotencyKey", "notes", "paidAt", "payToken", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "printAttempts", "printError", "printStatus", "printedAt", "scheduledAt", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType") SELECT "address", "cancelReason", "createdAt", "customerEmail", "customerName", "customerPhone", "deliveryFee", "discount", "etaMins", "flags", "fulfilment", "id", "idempotencyKey", "notes", "paidAt", "payToken", "paymentMethod", "paymentRef", "paymentStatus", "pointsEarned", "postcode", "printAttempts", "printError", "printStatus", "printedAt", "scheduledAt", "scheduledTime", "status", "subtotal", "total", "userId", "voucherCode", "whenType" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");
CREATE INDEX "Order_printStatus_idx" ON "Order"("printStatus");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "points" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deactivatedAt" DATETIME,
    "closedAt" DATETIME,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "marketingOptInAt" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'en'
);
INSERT INTO "new_User" ("closedAt", "createdAt", "deactivatedAt", "email", "id", "marketingOptIn", "marketingOptInAt", "name", "passwordHash", "permissions", "phone", "points", "referralCode", "role", "status") SELECT "closedAt", "createdAt", "deactivatedAt", "email", "id", "marketingOptIn", "marketingOptInAt", "name", "passwordHash", "permissions", "phone", "points", "referralCode", "role", "status" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
