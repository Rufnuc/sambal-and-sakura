import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { createOrderSchema } from "@/server/validation";
import { createOrder, OrderError } from "@/server/orders";
import { printNewOrder } from "@/server/print";
import { wechatAvailable } from "@/server/wechat";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { verifyHuman } from "@/server/turnstile";
import { phoneKey } from "@/server/phone";
import { log, errInfo } from "@/server/log";

// What a customer gets back about their own order (no internal fields such as payToken or flags).
function customerView<T extends Record<string, unknown>>(o: T) {
  const { payToken: _p, idempotencyKey: _i, flags: _f, printError: _e, printAttempts: _a, ...rest } = o;
  return rest;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your order details." }, { status: 400 });
  const d = parsed.data;
  const ip = clientIp(req);
  const user = await currentUser();

  // Anti-flood: real customers rarely place more than a couple of orders in 10 minutes.
  const limited = await limitOr429([
    { name: "order-ip", id: ip, limit: user ? 10 : 4, windowSec: 600 },
    { name: "order-phone", id: phoneKey(d.phone), limit: 6, windowSec: 86400 },
    { name: "order-user", id: user?.id, limit: 15, windowSec: 86400 },
  ], "Too many orders in a short time. Please call us if you need to order more.");
  if (limited) return limited;

  // Guests prove they're human (only when Turnstile keys are configured).
  if (!user && !(await verifyHuman(d.turnstileToken, ip))) {
    return NextResponse.json({ error: "Please complete the security check and try again." }, { status: 400 });
  }

  if (d.payMethod === "wechat" && !wechatAvailable()) {
    return NextResponse.json({ error: "WeChat Pay isn't available right now. Please choose cash." }, { status: 400 });
  }

  try {
    const { order, payToken, replay } = await createOrder(d, user);
    // Cash orders print straight away; WeChat orders print once payment is confirmed (notify route),
    // so the kitchen never starts an order that may never be paid for.
    if (!replay && order.paymentMethod !== "wechat") void printNewOrder(order.id);
    return NextResponse.json({ order: customerView(order), payToken });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    log.error("order_create_failed", errInfo(e));
    return NextResponse.json({ error: "We couldn't place your order. Please try again or call us." }, { status: 500 });
  }
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
  return NextResponse.json({ orders: orders.map(customerView) });
}
