import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { staffFor, adminUser } from "@/server/auth";
import { getCancelPolicy, countCancellations, resetCancellations } from "@/server/cancellations";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// How often the customer behind an order has cancelled / not collected recently (staff with Orders
// access), and the owner's "reset" for genuine cases.
export async function GET(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, customerPhone: true, customerEmail: true } });
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const policy = await getCancelPolicy();
  const count = await countCancellations({ userId: o.userId, phone: o.customerPhone, email: o.customerEmail }, policy);
  return NextResponse.json({ count, policy });
}

export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "Only the owner can reset this." }, { status: 403 });
  const parsed = z.object({ orderId: z.string().max(20) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const o = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { userId: true, customerPhone: true, customerEmail: true } });
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const reset = await resetCancellations({ userId: o.userId, phone: o.customerPhone, email: o.customerEmail });
  await audit({ actor: actorOf(u), action: "cancellations.reset", entity: "order", entityId: parsed.data.orderId, detail: { reset } });
  return NextResponse.json({ ok: true, reset });
}
