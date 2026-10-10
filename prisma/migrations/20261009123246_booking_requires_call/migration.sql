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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "date", "dietary", "email", "id", "name", "notes", "occasion", "party", "phone", "status", "tableId", "time", "userId") SELECT "createdAt", "date", "dietary", "email", "id", "name", "notes", "occasion", "party", "phone", "status", "tableId", "time", "userId" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX "Booking_date_idx" ON "Booking"("date");
CREATE INDEX "Booking_phone_date_idx" ON "Booking"("phone", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
