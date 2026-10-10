-- Orders that existed before print tracking must never be picked up by the print-retry worker.
UPDATE "Order" SET "printStatus" = 'not-needed';

-- Session tokens are now stored hashed: sign everyone out cleanly.
DELETE FROM "Session";

-- Points can never be negative.
UPDATE "User" SET "points" = 0 WHERE "points" < 0;
