import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { staffFor } from "@/server/auth";
import { adminOrder } from "@/server/admin-view";
import { getOrdersPaused } from "@/server/settings";
import { cleanQuery, nameVariants } from "@/server/sanitize";
import { phoneKey } from "@/server/phone";

// Live queue: every order that isn't finished, plus everything from the last `days` days (default 2,
// max 31). Optional ?q= searches ALL orders by order number, phone, name, email or postcode. Never silently truncates the
// active queue.
export async function GET(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const days = Math.min(31, Math.max(1, Number(sp.get("days")) || 2));
  const q = cleanQuery(sp.get("q"));
  const since = new Date(Date.now() - days * 86400000);

  const where = q
    ? { OR: [
        { id: { contains: q.toUpperCase() } },
        ...(phoneKey(q).length >= 3 ? [{ customerPhone: { contains: phoneKey(q) } }] : []),
        ...nameVariants(q).map((n) => ({ customerName: { contains: n } })),
        { customerEmail: { contains: q.toLowerCase() } },
        { postcode: { contains: q.toUpperCase() } },
      ] }
    : { OR: [{ createdAt: { gte: since } }, { status: { notIn: ["completed", "cancelled"] } }] };

  const [orders, paused] = await Promise.all([
    prisma.order.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    getOrdersPaused(),
  ]);
  return NextResponse.json({ orders: orders.map(adminOrder), paused, serverTime: Date.now() });
}
