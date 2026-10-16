import { prisma } from "@/server/db";
import { isUniqueViolation } from "@/server/ids";
import { ukParts, ukToUtc } from "@/server/order-time";
import { log, errInfo, alertOwner } from "@/server/log";

// Email through Brevo's transactional API (https://developers.brevo.com).
// Needs: BREVO_API_KEY, EMAIL_FROM (an address on a domain verified in Brevo), optional EMAIL_FROM_NAME.
// Without the key nothing is sent (and nothing breaks); each attempt is logged in EmailLog.
//
// Daily budget: Brevo's free plan allows 300 emails a day across everything. Order and booking
// emails always go first; promotional emails may only use what's left after a reserve, so a big
// promotion can never stop "your order is ready" emails. Set EMAIL_DAILY_LIMIT if you upgrade.

export const emailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);

export const DAILY_LIMIT = Number(process.env.EMAIL_DAILY_LIMIT) || 300;
const TRANSACTIONAL_RESERVE = Math.round(DAILY_LIMIT * 0.4); // kept free for order/booking emails

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  /** Adds List-Unsubscribe headers (promotional email). */
  unsubscribeUrl?: string;
  /** Where "Reply" goes (e.g. a job applicant), instead of our sending address. */
  replyTo?: { email: string; name?: string };
  /** Files sent with the email (base64 content). Keep the total under 4 MB. */
  attachments?: { name: string; content: string }[];
}

async function sentToday(kind?: "transactional" | "marketing"): Promise<number> {
  const start = ukToUtc(ukParts(new Date()).dateKey, "00:00");
  return prisma.emailLog.count({ where: { status: "sent", createdAt: { gte: start }, ...(kind ? { kind } : {}) } });
}

/** How many promotional emails may still go out today without eating into the order-email reserve. */
export async function marketingAllowanceToday(): Promise<number> {
  return Math.max(0, DAILY_LIMIT - TRANSACTIONAL_RESERVE - (await sentToday()));
}

async function brevoSend(m: EmailMessage): Promise<void> {
  const body: Record<string, unknown> = {
    sender: { email: process.env.EMAIL_FROM, name: process.env.EMAIL_FROM_NAME || "Sambal & Sakura" },
    to: [{ email: m.to.email, ...(m.to.name ? { name: m.to.name.slice(0, 70) } : {}) }],
    subject: m.subject.slice(0, 200),
    htmlContent: m.html,
    textContent: m.text,
  };
  if (m.replyTo) body.replyTo = { email: m.replyTo.email, ...(m.replyTo.name ? { name: m.replyTo.name.slice(0, 70) } : {}) };
  if (m.attachments?.length) body.attachment = m.attachments;
  if (m.unsubscribeUrl) {
    body.headers = { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  }
  const base = (process.env.BREVO_API_URL || "https://api.brevo.com").replace(/\/+$/, ""); // override only for testing
  const res = await fetch(`${base}/v3/smtp/email`, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Send an order/booking/account email once. `key` (e.g. "order:SS-ABC:ready") makes repeats a no-op.
 * Never throws: a failed email must never break an order.
 */
export async function sendTransactional(template: string, key: string, m: EmailMessage): Promise<boolean> {
  if (!emailConfigured() || !m.to.email) return false;
  try {
    // Claim the key first so two parallel triggers can't both send.
    await prisma.emailLog.create({ data: { kind: "transactional", template, key, status: "sent" } });
  } catch (e) {
    if (isUniqueViolation(e, "key")) return false; // already sent
    log.error("email_log_failed", { template, ...errInfo(e) });
    return false;
  }
  try {
    if ((await sentToday()) > DAILY_LIMIT) throw new Error("daily email limit reached");
    await brevoSend(m);
    log.info("email_sent", { template, key });
    return true;
  } catch (e) {
    await prisma.emailLog.update({ where: { key }, data: { status: "failed", error: errInfo(e).error } }).catch(() => {});
    log.error("email_failed", { template, key, ...errInfo(e) });
    void alertOwner("email-failing", `Customer emails are failing (${errInfo(e).error}). Check Brevo (key, sender domain, daily limit).`);
    return false;
  }
}

/** Send one promotional email (used by the campaign worker, which checks the allowance first). */
export async function sendMarketing(campaignId: string, m: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    await brevoSend(m);
    await prisma.emailLog.create({ data: { kind: "marketing", template: "campaign", campaignId, status: "sent" } });
    return true;
  } catch (e) {
    await prisma.emailLog.create({ data: { kind: "marketing", template: "campaign", campaignId, status: "failed", error: errInfo(e).error } }).catch(() => {});
    log.error("campaign_email_failed", { campaignId, ...errInfo(e) });
    return false;
  }
}
