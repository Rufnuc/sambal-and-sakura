import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { staffFor } from "@/server/auth";
import { adminOrder } from "@/server/admin-view";
import { getOrdersPaused } from "@/server/settings";

// Live queue: every order that isn't finished, plus everything from the last `days` days (default 2,
// max 31). Optional ?q= searches by order number, phone or name. Never silently truncates the
// active queue.
export async function GET(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const days = Math.min(31, Math.max(1, Number(sp.get("days")) || 2));
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const since = new Date(Date.now() - days * 86400000);

  const where = q
    ? { OR: [{ id: { contains: q.toUpperCase() } }, { customerPhone: { contains: q.replace(/\s/g, "") } }, { customerName: { contains: q } }] }
    : { OR: [{ createdAt: { gte: since } }, { status: { notIn: ["completed", "cancelled"] } }] };

  const [orders, paused] = await Promise.all([
    prisma.order.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    getOrdersPaused(),
  ]);
  return NextResponse.json({ orders: orders.map(adminOrder), paused, serverTime: Date.now() });
}
