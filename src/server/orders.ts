import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/server/db";
import { getBlackouts, getDisabledZones, getOrdersPaused } from "@/server/settings";
import { getEffectiveMenu, getZones, getMaxMiles, getOffers, getDeliveryRules } from "@/server/config";
import { getSiteContent } from "@/server/site-content";
import { computeTotals, offerVoucher, isValidPostcodeServer, LOYALTY_POINTS_PER_POUND, type IncomingLine, type Totals, type Voucher } from "@/server/pricing";
import { orderTiming, checkWhen, type OrderTiming } from "@/server/order-time";
import { phoneKey, canonicalPhone } from "@/server/phone";
import { orderRef, withFreshIds, isUniqueViolation } from "@/server/ids";
import { addPendingOrderPoints, confirmOrderPoints, reverseOrderPoints } from "@/server/points";
import { audit, type AuditActor } from "@/server/audit";
import { log, alertOwner } from "@/server/log";
import { noteOrderActivity } from "@/server/activity";
import { notifyOrder } from "@/server/notify";
import { getCancelPolicy, countCancellations, customerCanCancel } from "@/server/cancellations";
import { rewardReferrerIfQualified, emailReferralReward } from "@/server/referrals";
import { getPromotions, rewardUsableUntil, type Promotions } from "@/server/promotions";
import { printCancellation } from "@/server/print";
import type { Offer } from "@/lib/data/site";

export class OrderError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) { super(message); this.status = status; this.extra = extra; }
}

const REST_LAT = 54.5705, REST_LON = -1.2355;
const LARGE_ORDER_GBP = 150; // printed as "LARGE ORDER - CALL TO CONFIRM" for cash orders

function haversineMiles(lat2: number, lon2: number) {
  const R = 3958.8, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - REST_LAT), dLon = toRad(lon2 - REST_LON);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(REST_LAT)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Look the postcode up: "unknown" (doesn't exist), "unreachable" (lookup service down), or its distance. */
async function postcodeDistance(pc: string): Promise<{ kind: "found"; miles: number } | { kind: "unknown" } | { kind: "unreachable" }> {
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (r.status === 404) return { kind: "unknown" };
    if (!r.ok) return { kind: "unreachable" };
    const d = await r.json();
    return { kind: "found", miles: haversineMiles(d.result.latitude, d.result.longitude) };
  } catch { return { kind: "unreachable" }; }
}

// Names that try to look like a payment status on the kitchen ticket.
const PAYMENT_WORDS = /\b(paid|pre-?paid|no cash|don'?t collect|do not collect|already paid|payment (done|made|received))\b/i;

export interface QuoteInput {
  lines: IncomingLine[];
  fulfilment: "delivery" | "collection";
  postcode?: string;
  voucherCode?: string;
  phone?: string;
}

export interface Quote extends Omit<Totals, "zone"> {
  zone: { id: string; label: string; fee: number; etaMins: number } | null;
  minOrder: number;
  freeDeliveryThreshold: number | null; // null = no free delivery
  voucher: { code: string; label: string; minSpend: number; applied: boolean } | null;
  voucherError: string | null;
  timing: OrderTiming;
}

interface Resolved { quote: Quote; voucher: Voucher | null; ownedRewardId: string | null }

/** Find the voucher: one of the signed-in customer's own rewards, or a public offer code. */
async function resolveVoucher(code: string | undefined, user: User | null, promos: Promotions, offers: Offer[]): Promise<{ voucher: Voucher | null; ownedRewardId: string | null; error: string | null }> {
  const c = code?.toUpperCase().trim();
  if (!c) return { voucher: null, ownedRewardId: null, error: null };
  if (user) {
    const reward = await prisma.reward.findFirst({ where: { userId: user.id, code: c, used: false, expiresAt: { gt: new Date() } } });
    // A switched-off campaign's rewards work only until its grace period ends.
    if (reward && rewardUsableUntil(reward, promos) <= new Date()) return { voucher: null, ownedRewardId: null, error: "That reward's campaign has ended, so it can no longer be used." };
    if (reward) {
      // The welcome reward and a referred friend's reward are first-order offers: one per customer
      // (by phone), so they can't be stacked with each other or with SAKURA10.
      const welcome = reward.source === "welcome" || reward.source === "referral-welcome";
      return {
        ownedRewardId: reward.id, error: null,
        voucher: {
          code: c, label: reward.label, minSpend: reward.minSpend ?? 0,
          pctOff: reward.kind === "percent" ? reward.amount ?? undefined : undefined,
          amountOff: reward.kind === "voucher" ? reward.amount ?? undefined : undefined,
          ...(welcome ? { firstOrderOnly: true, onePerCustomer: "first-order" } : {}),
        },
      };
    }
  }
  const v = offerVoucher(c, offers); // the owner's live offers (Admin → Promotions)
  if (v && !promos.offers.enabled) return { voucher: null, ownedRewardId: null, error: "That offer has ended for now." };
  return v ? { voucher: v, ownedRewardId: null, error: null } : { voucher: null, ownedRewardId: null, error: "That voucher code isn't valid." };
}

/** Has this phone number (or account) placed a non-cancelled order before? */
async function hasOrderedBefore(phone: string | undefined, user: User | null): Promise<boolean> {
  const or: object[] = [];
  if (user) or.push({ userId: user.id });
  if (phone && phoneKey(phone).length >= 8) or.push({ customerPhone: canonicalPhone(phone) });
  if (!or.length) return false;
  return (await prisma.order.count({ where: { status: { not: "cancelled" }, OR: or } })) > 0;
}

async function voucherProblem(v: Voucher, phone: string | undefined, user: User | null): Promise<string | null> {
  if (v.firstOrderOnly && (await hasOrderedBefore(phone, user))) return "That code is for first orders only.";
  if (v.onePerCustomer && phone) {
    const used = await prisma.voucherRedemption.findUnique({ where: { group_phoneKey: { group: v.onePerCustomer, phoneKey: phoneKey(phone) } } });
    if (used) return "That offer has already been used with this phone number.";
  }
  return null;
}

/** Price an order exactly as checkout will charge it (the single source of truth for the UI). */
export async function buildQuote(input: QuoteInput, user: User | null): Promise<Resolved> {
  const [disabledZones, menu, zones, blackouts, paused, site, promos, offers, delivery] = await Promise.all([
    getDisabledZones(), getEffectiveMenu(), getZones(), getBlackouts(), getOrdersPaused(), getSiteContent(), getPromotions(), getOffers(), getDeliveryRules(),
  ]);
  const r = await resolveVoucher(input.voucherCode, user, promos, offers);
  let voucherError = r.error;
  let voucher = r.voucher;
  if (voucher) {
    const problem = await voucherProblem(voucher, input.phone, user);
    if (problem) { voucherError = problem; voucher = null; }
  }
  const totals = computeTotals({ lines: input.lines, fulfilment: input.fulfilment, postcode: input.postcode, voucher, disabledZones, menu, zones, delivery, autoFreeItem: promos.offers.enabled });
  const leadHours = Math.max(0, ...input.lines.map((l) => menu.find((m) => m.id === l.itemId)?.leadTimeHours ?? 0));
  const timing = orderTiming({ hours: site.business.hours, blackouts, leadHours, paused });
  const v = voucher ?? null;
  return {
    voucher: v,
    ownedRewardId: v ? r.ownedRewardId : null,
    quote: {
      ...totals,
      minOrder: delivery.minOrder,
      freeDeliveryThreshold: delivery.freeDeliveryOver,
      voucher: v ? { code: v.code, label: v.label, minSpend: v.minSpend ?? 0, applied: totals.voucherApplied } : null,
      voucherError,
      timing,
    },
  };
}

export interface CreateOrderInput extends QuoteInput {
  address?: string;
  name: string;
  phone: string;
  email: string;
  notes?: string;
  whenType: "asap" | "scheduled";
  scheduledFor?: string;
  payMethod: "cash" | "wechat";
  expectedTotal?: number;
  idempotencyKey?: string;
  locale?: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const payTokenHash = sha256;

/** The earlier order for a retried checkout, if this request comes from the same customer. */
function replayFor<O extends { userId: string | null; customerPhone: string; customerEmail: string | null }>(existing: O, input: CreateOrderInput, user: User | null) {
  const same = existing.userId
    ? user?.id === existing.userId
    : canonicalPhone(input.phone) === existing.customerPhone && (input.email ?? "").toLowerCase() === (existing.customerEmail ?? "").toLowerCase();
  if (!same) throw new OrderError("This order has already been sent. Please refresh the page and check your basket.", 409);
  return { order: existing, payToken: null as string | null, replay: true };
}

/**
 * Validate and save an order. Throws OrderError (with a customer-friendly message) on any problem.
 * Returns the saved order and, for WeChat, the one-time payment token for this browser.
 */
export async function createOrder(input: CreateOrderInput, user: User | null) {
  if (PAYMENT_WORDS.test(input.name)) throw new OrderError("Please enter just your name.");

  // Retried checkout (double tap, flaky signal): return the order we already made - but only to the
  // same customer. The key comes from the browser, so anyone else re-using it gets no details back.
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } });
    if (existing) return replayFor(existing, input, user);
  }

  const { quote, voucher, ownedRewardId } = await buildQuote(input, user);

  if (quote.issues.length) {
    const names = quote.issues.map((i) => i.name).join(", ");
    throw new OrderError(`Your basket changed: ${names} ${quote.issues.length === 1 ? "is" : "are"} no longer available as chosen. Please review your basket.`, 409, { quote });
  }
  if (input.voucherCode && quote.voucherError) throw new OrderError(quote.voucherError, 400, { quote });
  if (quote.lines.length === 0) throw new OrderError("No valid items in your order.");
  if (!quote.minMet) throw new OrderError(`The minimum for delivery is £${quote.minOrder.toFixed(2)} of food.`);

  const when = checkWhen(input.whenType, input.scheduledFor, quote.timing);
  if (!when.ok) throw new OrderError(when.error, 409, { quote });

  const flags: string[] = [];
  const delivery = input.fulfilment === "delivery";
  if (delivery) {
    if (!input.postcode || !isValidPostcodeServer(input.postcode)) throw new OrderError("Enter your full UK postcode (for example TS1 3QP).");
    if (!quote.inArea) throw new OrderError("We don't deliver to that postcode.");
    if (!input.address || input.address.length < 4) throw new OrderError("Enter your delivery address.");
  }

  // Prices are recomputed on the server; if they differ from what the customer was shown, ask them to confirm.
  if (typeof input.expectedTotal === "number" && Math.abs(input.expectedTotal - quote.total) > 0.005) {
    throw new OrderError(`The total has changed to £${quote.total.toFixed(2)}. Please check and place your order again.`, 409, { quote });
  }

  // The remaining checks don't depend on each other, so they run together (one round of waiting, not five).
  const [dist, maxMiles, [policy, cancels]] = await Promise.all([
    delivery ? postcodeDistance(input.postcode!) : null,
    delivery ? getMaxMiles() : 0,
    getCancelPolicy().then(async (p) => [p, await countCancellations({ userId: user?.id, phone: input.phone, email: input.email }, p)] as const),
  ]);

  if (dist) {
    if (dist.kind === "unknown") throw new OrderError("We couldn't find that postcode - please check it.");
    if (dist.kind === "unreachable") flags.push("address-unverified"); // don't turn customers away, but tell the kitchen
    if (dist.kind === "found" && maxMiles > 0 && dist.miles > maxMiles) {
      throw new OrderError(`Sorry, that address is outside our ${maxMiles}-mile delivery range. Collection is still available.`);
    }
  }

  // (No "new customer - call to confirm" flag: the owner chose not to phone first-time customers.)
  if (input.payMethod === "cash" && quote.total >= LARGE_ORDER_GBP) flags.push("large-order");

  // People who often cancel or don't collect: flag the ticket, and (if the owner chose it) no cash delivery.
  if (cancels >= policy.flagAt) flags.push("frequent-canceller");
  if (cancels >= policy.restrictAt && policy.restrictAction === "block-cash-delivery" && input.payMethod === "cash" && delivery) {
    throw new OrderError("Because of recent cancelled or uncollected orders, we can't take a cash delivery order right now. Please choose collection, or call us.", 409);
  }

  // Points: earned on the food you paid for (not delivery), pending until the order is completed.
  const pointsEarned = user ? Math.max(0, Math.round((quote.subtotal - quote.discount) * LOYALTY_POINTS_PER_POUND)) : 0;
  const payToken = input.payMethod === "wechat" ? randomBytes(24).toString("hex") : null;

  try {
    const order = await withFreshIds(() => prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          id: orderRef(),
          userId: user?.id ?? null,
          customerName: input.name, customerPhone: canonicalPhone(input.phone), customerEmail: input.email,
          fulfilment: input.fulfilment, status: "received",
          subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, discount: quote.discount, total: quote.total,
          voucherCode: voucher && quote.voucherApplied ? voucher.code : null,
          address: input.fulfilment === "delivery" ? input.address : null,
          postcode: input.fulfilment === "delivery" ? input.postcode!.toUpperCase() : null,
          notes: input.notes || null,
          whenType: when.whenType, scheduledTime: when.label, scheduledAt: when.scheduledAt,
          etaMins: quote.zone?.etaMins ?? 25, pointsEarned,
          paymentMethod: input.payMethod, paymentStatus: "unpaid",
          payToken: payToken ? sha256(payToken) : null,
          idempotencyKey: input.idempotencyKey || null,
          printStatus: "pending", // WeChat orders print once paid (see the WeChat notify route)
          flags: JSON.stringify(flags),
          locale: input.locale ?? "en",
          lines: { create: quote.lines.map((l) => ({ itemId: l.itemId, name: l.name, unitPrice: l.unitPrice, qty: l.qty, modifiers: JSON.stringify(l.modifiers) })) },
        },
        include: { lines: true },
      });
      if (voucher && quote.voucherApplied) {
        if (ownedRewardId) {
          // Guarded: if two checkouts race with the same reward, only one can flip it to used.
          const used = await tx.reward.updateMany({
            where: { id: ownedRewardId, used: false, expiresAt: { gt: new Date() } },
            data: { used: true, usedAt: new Date(), orderId: created.id },
          });
          if (used.count !== 1) throw new OrderError("That reward has already been used.", 409);
        }
        if (voucher.onePerCustomer) {
          await tx.voucherRedemption.create({ data: { group: voucher.onePerCustomer, phoneKey: phoneKey(input.phone), orderId: created.id } });
        }
      }
      if (user) {
        await addPendingOrderPoints(tx, user.id, created.id, pointsEarned);
        if (input.locale && input.locale !== user.locale) await tx.user.update({ where: { id: user.id }, data: { locale: input.locale } }); // emails follow their latest language
      }
      return created;
    }), ["id"]);
    noteOrderActivity();
    notifyOrder(order.id, "received");
    log.info("order_created", { orderId: order.id, fulfilment: order.fulfilment, total: order.total, payMethod: order.paymentMethod, user: !!user, flags });
    return { order, payToken, replay: false };
  } catch (e) {
    if (e instanceof OrderError) throw e;
    if (isUniqueViolation(e, "group")) throw new OrderError("That offer has already been used with this phone number.", 409);
    if (isUniqueViolation(e, "idempotencyKey") && input.idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { lines: true } });
      if (existing) return replayFor(existing, input, user);
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ status changes */

const STAGE: Record<string, number> = { received: 0, preparing: 1, "out-for-delivery": 2, "ready-for-collection": 2, completed: 3 };

/** Is moving an order from `from` to `to` allowed? */
export function canMoveOrder(from: string, to: string, fulfilment: string): boolean {
  if (from === to) return false;
  if (from === "completed" || from === "cancelled") return false; // final
  if (to === "cancelled") return true;
  if (to === "out-for-delivery" && fulfilment !== "delivery") return false;
  if (to === "ready-for-collection" && fulfilment !== "collection") return false;
  const a = STAGE[from], b = STAGE[to];
  if (a === undefined || b === undefined) return false;
  return b > a || b === a - 1; // forward, or one step back to fix a mis-tap
}

/** Change an order's status with its side effects (points, rewards, offers) and an audit row, atomically. */
export type CancelKind = "customer" | "no-show" | "staff";

export async function changeOrderStatus(orderId: string, to: string, actor: AuditActor, opts: { reason?: string; ip?: string; cancelKind?: CancelKind } = {}) {
  noteOrderActivity();
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderError("Order not found.", 404);
    if (!canMoveOrder(order.status, to, order.fulfilment)) throw new OrderError(`Can't change an order from "${order.status}" to "${to}".`, 409);

    // Guarded: if two staff tap at once, only the first change applies.
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: to, ...(to === "cancelled" ? { cancelReason: opts.reason?.slice(0, 200) || null, cancelKind: opts.cancelKind ?? "staff", cancelledAt: new Date() } : {}) },
    });
    if (moved.count !== 1) throw new OrderError("Someone else just updated this order. Refresh and try again.", 409);

    let referralRewarded: string | null = null;
    if (to === "completed") {
      await confirmOrderPoints(tx, orderId, order.userId);
      referralRewarded = await rewardReferrerIfQualified(tx, order); // their friend's first completed order
    }
    if (to === "cancelled") {
      await reverseOrderPoints(tx, orderId, order.userId);
      await tx.reward.updateMany({ where: { orderId }, data: { used: false, usedAt: null, orderId: null } });
      await tx.voucherRedemption.deleteMany({ where: { orderId } });
    }
    await audit({ actor, action: "order.status", entity: "order", entityId: orderId, detail: { from: order.status, to, reason: opts.reason, cancelKind: to === "cancelled" ? opts.cancelKind ?? "staff" : undefined }, ip: opts.ip }, tx);

    if (to === "cancelled" && order.paymentStatus === "paid") {
      void alertOwner(`refund:${orderId}`, `Order ${orderId} was cancelled but was paid by WeChat (£${order.total.toFixed(2)}). Refund it in the WeChat Pay merchant platform.`);
    }
    return { updated: await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } }), before: order, referralRewarded };
  }).then(({ updated, before, referralRewarded }) => {
    notifyOrder(orderId, to);
    if (referralRewarded) void emailReferralReward(referralRewarded);
    // The kitchen may already be cooking: print a STOP ticket for any cancelled order that was sent to the kitchen.
    if (to === "cancelled" && ["printed", "pending", "failed"].includes(before.printStatus) && (before.paymentMethod !== "wechat" || before.paymentStatus === "paid")) {
      void printCancellation(orderId);
    }
    return updated;
  });
}

/** The customer cancels from their tracking page (only inside the allowed window). */
export async function customerCancelOrder(orderId: string, reason: string, phone: string, ip?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("Order not found.", 404);
  const check = await customerCanCancel(order, await getCancelPolicy(), phone);
  if (!check.can) throw new OrderError(check.reason, 409);
  const updated = await changeOrderStatus(orderId, "cancelled", { id: "customer", email: order.customerEmail ?? "customer" }, { reason: `Customer: ${reason}`, ip, cancelKind: "customer" });
  void alertOwner(`cust-cancel:${orderId}`, `Order ${orderId} (£${order.total.toFixed(2)}) was CANCELLED by the customer - stop preparing it. Reason: ${reason}`);
  return updated;
}
