import { prisma } from "@/server/db";
import { SITE_URL } from "@/lib/site-url";
import { hmac } from "@/server/secrets";
import { getSiteContent } from "@/server/site-content";
import { marketingAllowanceToday, sendMarketing } from "@/server/email";
import { campaignEmail } from "@/server/email-templates";
import { log } from "@/server/log";

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

// In-memory hint so the every-minute worker only touches the database when there's work.
let pending = true; // check once after start-up
export const markCampaignWork = () => { pending = true; };

const BATCH = 25;

export async function processCampaigns(): Promise<void> {
  if (!pending) return;
  const campaign = await prisma.campaign.findFirst({ where: { status: { in: ["queued", "sending"] } }, orderBy: { createdAt: "asc" } });
  if (!campaign) { pending = false; return; }

  const allowance = await marketingAllowanceToday();
  if (allowance <= 0) return; // today's spare allowance used: continue tomorrow (order emails come first)

  const batch = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "pending" }, take: Math.min(BATCH, allowance) });
  if (campaign.status === "queued") await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sending" } });
  const { business } = await getSiteContent();
  let translations: CampaignTranslations = {};
  try { translations = JSON.parse(campaign.translations); } catch { /* English only */ }

  for (const r of batch) {
    const user = await prisma.user.findUnique({ where: { id: r.userId } });
    // Re-check consent at send time: they may have unsubscribed or closed their account since.
    if (!user || user.status !== "active" || !user.marketingOptIn) {
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "skipped" } });
      continue;
    }
    const unsub = unsubscribeUrl(user.id);
    // Their language version if the owner wrote one, otherwise English (with English greeting/footer).
    const version = user.locale !== "en" ? translations[user.locale as keyof CampaignTranslations] : undefined;
    const m = version?.subject && version.body
      ? campaignEmail(version.subject, version.body, user.name, user.locale, unsub, business)
      : campaignEmail(campaign.subject, campaign.body, user.name, "en", unsub, business);
    const ok = await sendMarketing(campaign.id, { to: { email: user.email, name: user.name }, ...m, unsubscribeUrl: unsub });
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: ok ? "sent" : "failed", sentAt: ok ? new Date() : null } });
    await prisma.campaign.update({ where: { id: campaign.id }, data: ok ? { sent: { increment: 1 } } : { failed: { increment: 1 } } });
  }

  const left = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "pending" } });
  if (left === 0) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "sent", finishedAt: new Date() } });
    log.info("campaign_finished", { campaignId: campaign.id });
  }
}
