-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Booking_email_idx" ON "Booking"("email");

-- CreateIndex
CREATE INDEX "AuditLog_actorEmail_idx" ON "AuditLog"("actorEmail");

-- CreateIndex
CREATE INDEX "CampaignRecipient_userId_idx" ON "CampaignRecipient"("userId");


-- Row Level Security on every table.
-- The website connects as the database owner (the role that ran these migrations), and owners are
-- not restricted by RLS, so the site works exactly as before. Any OTHER role - a read-only login,
-- a hosted "Data API"/PostgREST endpoint, a leaked connection for a different user - gets no rows
-- at all, because there are deliberately no policies. Customer data is only ever served through the
-- website's own checked API routes.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', current_schema(), t.tablename);
  END LOOP;
END $$;
