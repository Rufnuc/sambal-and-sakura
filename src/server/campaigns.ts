import { prisma } from "@/server/db";
import { SITE_URL } from "@/lib/site-url";
import { hmac } from "@/server/secrets";
import { getSiteContent } from "@/server/site-content";
import { marketingAllowanceToday, sendMarketing } from "@/server/email";
import { campaignEmail } from "@/server/email-templates";
import { log } from "@/server/log";
import { markCampaignWork, campaignWorkPending, clearCampaignWork } from "@/server/activity";

// Promotional emails from Admin → Promotions. Only to customers who opted in (UK PECR), with an
// unsubscribe link in every email. Sent by the background worker in small batches, using only
// the day's spare allowance (see email.ts), continuing the next day if needed.

export const unsubscribeUrl = (userId: string) => `${SITE_URL}/unsubscribe?u=${encodeURIComponent(userId)}&t=${hmac("unsubscribe", userId)}`;

/** Customers who can receive promotions: active accounts that said yes. */
export const marketableWhere = { role: "customer", status: "active", marketingOptIn: true } as const;

export type CampaignTranslations = Partial<Record<"zh" | "vi" | "ja", { subject: string; body: string }>>;

export async function createCampaign(input: { subject: string; body: string; translations?: CampaignTranslations; audience: "all" | "selected"; userIds?: string[]; createdBy: string }) {
  const recipients = await prisma.user.findMany({
    where: { ...marketableWhere, ...(input.audience === "selected" ? { id: { in: input.userIds ?? [] } } : {}) },
    select: { id: true },
  });
  const campaign = await prisma.campaign.create({
    data: {
      subject: input.subject, body: input.body, audience: input.audience, createdBy: input.createdBy,
      translations: JSON.stringify(input.translations ?? {}),
      total: recipients.length, status: recipients.length ? "queued" : "sent", finishedAt: recipients.length ? null : new Date(),
      recipients: { create: recipients.map((r) => ({ userId: r.id })) },
    },
  });
  if (recipients.length) markCampaignWork();
  return campaign;
}

// Shared hint (see activity.ts) so the every-minute worker only touches the database when there's work.
export { markCampaignWork } from "@/server/activity";

const BATCH = 25;

export async function processCampaigns(): Promise<void> {
  if (!campaignWorkPending()) return;
  const campaign = await prisma.campaign.findFirst({ where: { status: { in: ["queued", "sending"] } }, orderBy: { createdAt: "asc" } });
  if (!campaign) { clearCampaignWork(); return; }

  const allowance = await marketingAllowanceToday();
  if (allowance <= 0) return; // today's spare allowance used: continue tomorrow (order emails come first)

  const batch = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "pending" }, take: Math.min(BATCH, allowance) });
  if (campaign.status === "queued") await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sending" } });
  const { business } = await getSiteContent();
  let translations: CampaignTranslations = {};
  try { translations = JSON.parse(campaign.translations); } catch { /* English only */ }

  // One query for every customer in the batch (not one per email).
  const users = new Map((await prisma.user.findMany({ where: { id: { in: batch.map((r) => r.userId) } } })).map((u) => [u.id, u]));
  // Re-check consent at send time: they may have unsubscribed or closed their account since.
  const skipped = batch.filter((r) => { const u = users.get(r.userId); return !u || u.status !== "active" || !u.marketingOptIn; });
  if (skipped.length) await prisma.campaignRecipient.updateMany({ where: { id: { in: skipped.map((r) => r.id) } }, data: { status: "skipped" } });

  for (const r of batch) {
    const user = users.get(r.userId);
    if (!user || skipped.includes(r)) continue;
    const unsub = unsubscribeUrl(user.id);
    // Their language version if the owner wrote one, otherwise English (with English greeting/footer).
    const version = user.locale !== "en" ? translations[user.locale as keyof CampaignTranslations] : undefined;
    const m = version?.subject && version.body
      ? campaignEmail(version.subject, version.body, user.name, user.locale, unsub, business)
      : campaignEmail(campaign.subject, campaign.body, user.name, "en", unsub, business);
    const ok = await sendMarketing(campaign.id, { to: { email: user.email, name: user.name }, ...m, unsubscribeUrl: unsub });
    // Recorded straight after each send, so a restart mid-batch never emails anyone twice.
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: ok ? "sent" : "failed", sentAt: ok ? new Date() : null } });
  }

  // Totals in one grouped query, then one update (instead of an update per email).
  const counts = Object.fromEntries((await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: true })).map((c) => [c.status, c._count]));
  await prisma.campaign.update({ where: { id: campaign.id }, data: { sent: counts.sent ?? 0, failed: counts.failed ?? 0 } });

  if (!counts.pending) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sent", finishedAt: new Date() } });
    log.info("campaign_finished", { campaignId: campaign.id });
  }
}
