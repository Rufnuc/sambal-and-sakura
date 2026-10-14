-- CreateIndex
CREATE INDEX "AuditLog_actorEmail_idx" ON "AuditLog"("actorEmail");

-- CreateIndex
CREATE INDEX "Booking_email_idx" ON "Booking"("email");

-- CreateIndex
CREATE INDEX "CampaignRecipient_userId_idx" ON "CampaignRecipient"("userId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
