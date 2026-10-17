import { z } from "zod";
import type { Order } from "@prisma/client";
import { prisma } from "@/server/db";
import { hmac, hmacEquals } from "@/server/secrets";
import { canonicalPhone } from "@/server/phone";
import { SITE_URL } from "@/lib/site-url";

// Order cancellations by customers, and limits for people who cancel (or don't collect) too often.
// The owner changes the numbers in Admin → Settings → "Cancellations".

export const cancelPolicySchema = z.object({
  customerCancelMinutes: z.number().int().min(0).max(60),   // ASAP orders: customers can cancel this long after ordering (0 = never online)
  scheduledCutoffMinutes: z.number().int().min(0).max(1440), // scheduled orders: until this long before the time it's for
  windowDays: z.number().int().min(7).max(365),             // how far back cancellations count
  flagAt: z.number().int().min(1).max(20),                   // this many → "call to confirm" on tickets and in the admin
  restrictAt: z.number().int().min(1).max(50),               // this many → restricted (below)
  restrictAction: z.enum(["block-cash-delivery", "flag-only"]), // block = no online cancel + no cash delivery
});
export type CancelPolicy = z.infer<typeof cancelPolicySchema>;

export const DEFAULT_CANCEL_POLICY: CancelPolicy = {
  customerCancelMinutes: 5, scheduledCutoffMinutes: 60, windowDays: 60, flagAt: 2, restrictAt: 3, restrictAction: "block-cash-delivery",
};

export async function getCancelPolicy(): Promise<CancelPolicy> {
  const row = await prisma.setting.findUnique({ where: { key: "cancelPolicy" } });
  if (!row) return DEFAULT_CANCEL_POLICY;
  try { return cancelPolicySchema.parse({ ...DEFAULT_CANCEL_POLICY, ...JSON.parse(row.value) }); } catch { return DEFAULT_CANCEL_POLICY; }
}
export async function setCancelPolicy(p: CancelPolicy) {
  const value = JSON.stringify(p);
  await prisma.setting.upsert({ where: { key: "cancelPolicy" }, create: { key: "cancelPolicy", value }, update: { value } });
}

export interface CustomerIds { userId?: string | null; phone?: string | null; email?: string | null }

function idFilter(ids: CustomerIds) {
  const or: object[] = [];
  if (ids.userId) or.push({ userId: ids.userId });
  if (ids.phone) or.push({ customerPhone: canonicalPhone(ids.phone) });
  if (ids.email) or.push({ customerEmail: ids.email.trim().toLowerCase() });
  return or;
}

/**
 * Cancellations that count against this customer in the policy window:
 *  - anything on their own account;
 *  - self-service cancels (tracking link) only when BOTH the phone and the email match - neither is
 *    verified, so one of them alone would let a stranger place and cancel orders under someone else's
 *    email (or phone) and get that person blocked from cash delivery;
 *  - no-shows recorded by staff (a real order that wasn't collected) by phone OR email.
 */
export async function countCancellations(ids: CustomerIds, policy: CancelPolicy): Promise<number> {
  const phone = ids.phone ? canonicalPhone(ids.phone) : null;
  const email = ids.email ? ids.email.trim().toLowerCase() : null;
  const or: object[] = [];
  if (ids.userId) or.push({ userId: ids.userId });
  if (phone && email) or.push({ cancelKind: "customer", customerPhone: phone, customerEmail: email });
  const noShow = [...(phone ? [{ customerPhone: phone }] : []), ...(email ? [{ customerEmail: email }] : [])];
  if (noShow.length) or.push({ cancelKind: "no-show", OR: noShow });
  if (!or.length) return 0;
  return prisma.order.count({
    where: {
      status: "cancelled", cancelCounted: true, cancelKind: { in: ["customer", "no-show"] },
      cancelledAt: { gte: new Date(Date.now() - policy.windowDays * 86400000) },
      OR: or,
    },
  });
}

/** Owner: wipe the slate for a customer (their past cancellations stop counting). */
export async function resetCancellations(ids: CustomerIds): Promise<number> {
  const or = idFilter(ids);
  if (!or.length) return 0;
  const r = await prisma.order.updateMany({ where: { status: "cancelled", cancelCounted: true, OR: or }, data: { cancelCounted: false } });
  return r.count;
}

export type CancelCheck = { can: true; secondsLeft: number } | { can: false; reason: string };

/** Can the customer cancel this order online right now? */
export async function customerCanCancel(o: Pick<Order, "status" | "createdAt" | "whenType" | "scheduledAt" | "userId" | "customerPhone" | "customerEmail">, policy: CancelPolicy, phone: string): Promise<CancelCheck> {
  const call = `Please call us on ${phone}.`;
  if (o.status === "cancelled") return { can: false, reason: "This order has been cancelled." };
  if (!["received", "preparing"].includes(o.status)) return { can: false, reason: `It's too late to cancel online. ${call}` };
  if (policy.customerCancelMinutes === 0) return { can: false, reason: `To cancel, ${call.charAt(0).toLowerCase()}${call.slice(1)}` }; // owner set "phone only"
  const now = Date.now();
  const deadline = o.whenType === "scheduled" && o.scheduledAt
    ? Math.max(o.createdAt.getTime() + policy.customerCancelMinutes * 60_000, o.scheduledAt.getTime() - policy.scheduledCutoffMinutes * 60_000)
    : o.createdAt.getTime() + policy.customerCancelMinutes * 60_000;
  if (now >= deadline) return { can: false, reason: `The kitchen has started on your order, so it can't be cancelled online. ${call}` };
  if (policy.restrictAction === "block-cash-delivery") {
    const n = await countCancellations({ userId: o.userId, phone: o.customerPhone, email: o.customerEmail }, policy);
    if (n >= policy.restrictAt) return { can: false, reason: `Online cancelling isn't available on this account. ${call}` };
  }
  return { can: true, secondsLeft: Math.ceil((deadline - now) / 1000) };
}

/* ---- Tracking links: /track/<order>?t=<signed code>, so nobody can open other people's orders ---- */
export const trackToken = (orderId: string) => hmac("track", orderId);
export const trackPath = (orderId: string) => `/track/${encodeURIComponent(orderId)}?t=${trackToken(orderId)}`;
export const trackUrl = (orderId: string) => `${SITE_URL}${trackPath(orderId)}`;
export const validTrackToken = (orderId: string, t: string) => !!t && hmacEquals("track", orderId, t);
