-- Handover code on orders, email confirmation on accounts, one-time email links.
ALTER TABLE "Order" ADD COLUMN "handoverCode" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;
-- Accounts made before email confirmation existed are treated as confirmed, so their marketing choice carries on.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";

CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");
