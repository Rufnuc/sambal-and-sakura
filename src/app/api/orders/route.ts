import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { getDisabledZones } from "@/server/settings";
import { getEffectiveMenu, getZones, getMaxMiles } from "@/server/config";
import { computeTotals, globalVoucher, isValidPostcodeServer, LOYALTY_POINTS_PER_POUND, type Voucher } from "@/server/pricing";
import { createOrderSchema } from "@/server/validation";
import { printOrder } from "@/server/print";
import { wechatAvailable } from "@/server/wechat";

const FIRST_ORDER_CODES = new Set(["SAKURA10"]);

const REST_LAT = 54.5705, REST_LON = -1.2355;
function haversineMiles(lat2: number, lon2: number) {
  const R = 3958.8, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - REST_LAT), dLon = toRad(lon2 - REST_LON);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(REST_LAT)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function postcodeMiles(pc: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = await r.json();
    return haversineMiles(d.result.latitude, d.result.longitude);
  } catch { return null; }
}

function orderRef() { return "SS-" + Math.random().toString(36).slice(2, 7).toUpperCase(); }

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const d = parsed.data;

  // WeChat Pay only when the merchant keys are configured (or in local dev, so it can be previewed).
  if (d.payMethod === "wechat" && !wechatAvailable()) {
    return NextResponse.json({ error: "WeChat Pay isn't available right now. Please choose cash." }, { status: 400 });
  }

  const user = await currentUser();
  const [disabledZones, menu, zones] = await Promise.all([getDisabledZones(), getEffectiveMenu(), getZones()]);

  // Resolve a voucher: a global code, or one of the signed-in user's unused rewards.
  // Only ONE voucher/reward may apply per order (single voucherCode field).
  let voucher: Voucher | null = null;
  let ownedRewardId: string | null = null;
  if (d.voucherCode) {
    const code = d.voucherCode.toUpperCase().trim();
    if (user) {
      const reward = await prisma.reward.findFirst({
        where: { userId: user.id, code, used: false, expiresAt: { gt: new Date() } },
      });
      if (reward) {
        ownedRewardId = reward.id;
        voucher = {
          code,
          label: reward.label,
          pctOff: reward.kind === "percent" ? reward.amount ?? undefined : undefined,
          amountOff: reward.kind === "voucher" ? reward.amount ?? undefined : undefined,
          minSpend: 0,
        };
      }
    }
    if (!voucher) voucher = globalVoucher(code);
    if (!voucher) return NextResponse.json({ error: "That voucher code isn't valid." }, { status: 400 });

    // First-order-only codes can't be reused once the account has ordered.
    if (FIRST_ORDER_CODES.has(voucher.code) && user) {
      const prior = await prisma.order.count({ where: { userId: user.id, status: { not: "cancelled" } } });
      if (prior > 0) return NextResponse.json({ error: "That code is for first orders only." }, { status: 400 });
    }
  }

  const totals = computeTotals({ lines: d.lines, fulfilment: d.fulfilment, postcode: d.postcode, voucher, disabledZones, menu, zones });

  if (totals.lines.length === 0) return NextResponse.json({ error: "No valid items in your order." }, { status: 400 });
  if (!totals.minMet) return NextResponse.json({ error: "Order is below the minimum." }, { status: 400 });
  if (d.fulfilment === "delivery") {
    if (!d.postcode || !isValidPostcodeServer(d.postcode)) return NextResponse.json({ error: "Enter a valid UK postcode." }, { status: 400 });
    if (!totals.inArea) return NextResponse.json({ error: "We don't deliver to that postcode." }, { status: 400 });
    if (!d.address || d.address.length < 4) return NextResponse.json({ error: "Enter your delivery address." }, { status: 400 });
    // Max-mileage cap (operator-set). Skipped if the postcode can't be geocoded.
    const maxMiles = await getMaxMiles();
    if (maxMiles > 0) {
      const miles = await postcodeMiles(d.postcode);
      if (miles !== null && miles > maxMiles) {
        return NextResponse.json({ error: `Sorry, that address is outside our ${maxMiles}-mile delivery range. Collection is still available.` }, { status: 400 });
      }
    }
  }

  const pointsEarned = user ? Math.round(totals.total * LOYALTY_POINTS_PER_POUND) : 0;
  const etaMins = totals.zone?.etaMins ?? 25;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        id: orderRef(),
        userId: user?.id ?? null,
        customerName: d.name, customerPhone: d.phone, customerEmail: d.email || user?.email || null,
        fulfilment: d.fulfilment, status: "received",
        subtotal: totals.subtotal, deliveryFee: totals.deliveryFee, discount: totals.discount, total: totals.total,
        voucherCode: voucher?.code ?? null,
        address: d.fulfilment === "delivery" ? d.address : null,
        postcode: d.fulfilment === "delivery" ? d.postcode : null,
        notes: d.notes || null,
        whenType: d.whenType, scheduledTime: d.whenType === "scheduled" ? d.scheduledTime ?? null : null,
        etaMins, pointsEarned,
        paymentMethod: d.payMethod, paymentStatus: "unpaid",
        lines: { create: totals.lines.map((l) => ({ itemId: l.itemId, name: l.name, unitPrice: l.unitPrice, qty: l.qty, modifiers: JSON.stringify(l.modifiers) })) },
      },
      include: { lines: true },
    });
    if (user && pointsEarned) await tx.user.update({ where: { id: user.id }, data: { points: { increment: pointsEarned } } });
    if (ownedRewardId) await tx.reward.update({ where: { id: ownedRewardId }, data: { used: true } });
    return created;
  });

  // Cash orders print straight away. WeChat orders print once payment is confirmed (see /api/pay/wechat/notify),
  // so the kitchen never starts an order that may never be paid for. No-op unless PrintNode is configured.
  if (order.paymentMethod !== "wechat") void printOrder({
    id: order.id, fulfilment: order.fulfilment, customerName: order.customerName, customerPhone: order.customerPhone,
    address: order.address, postcode: order.postcode, notes: order.notes,
    whenType: order.whenType, scheduledTime: order.scheduledTime, etaMins: order.etaMins,
    subtotal: order.subtotal, deliveryFee: order.deliveryFee, discount: order.discount, total: order.total,
    voucherCode: order.voucherCode, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, lines: order.lines,
  });

  return NextResponse.json({ order });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ orders: [] });
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: { lines: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ orders });
}
