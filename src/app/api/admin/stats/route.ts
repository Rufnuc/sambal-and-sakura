import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, isStaffRole } from "@/server/auth";
import { canAccess, parsePermissions } from "@/lib/admin/sections";
import { ukParts, addDays } from "@/server/order-time";
import { MENU } from "@/lib/data/menu";

const DAYS = 14;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Dashboard numbers, computed on the server from the database (not from a truncated list in the
// browser). Every staff member sees the totals; recent orders / today's bookings (which include
// names) only if they have access to those sections.
export async function GET() {
  const u = await currentUser();
  if (!u || !isStaffRole(u.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const perms = parsePermissions(u.permissions);
  const today = ukParts(new Date()).dateKey;
  const since = new Date(Date.now() - DAYS * 86400000);

  const [orders, bookingsWeek, pastBookings, events] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true, status: true, total: true, discount: true, fulfilment: true, customerPhone: true, customerName: true, lines: { select: { name: true, qty: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.booking.findMany({ where: { date: { gte: addDays(today, -3), lte: addDays(today, 3) } }, orderBy: [{ date: "asc" }, { time: "asc" }] }),
    prisma.booking.groupBy({ by: ["status"], where: { date: { gte: addDays(today, -30), lt: today }, status: { in: ["completed", "no-show", "seated"] } }, _count: true }),
    prisma.event.groupBy({ by: ["name"], where: { createdAt: { gte: since }, name: { in: ["begin_checkout", "order_placed"] } }, _count: true }),
  ]);

  const live = orders.filter((o) => o.status !== "cancelled");
  const completed = live.filter((o) => o.status === "completed");
  const revenue = completed.reduce((s, o) => s + o.total, 0);
  const byPhone = new Map<string, number>();
  for (const o of live) if (o.customerPhone) byPhone.set(o.customerPhone, (byPhone.get(o.customerPhone) ?? 0) + 1);
  const repeat = [...byPhone.values()].filter((n) => n > 1).length;
  const noShows = pastBookings.find((g) => g.status === "no-show")?._count ?? 0;
  const pastTotal = pastBookings.reduce((n, g) => n + g._count, 0);
  const begun = events.find((e) => e.name === "begin_checkout")?._count ?? 0;
  const placed = events.find((e) => e.name === "order_placed")?._count ?? 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

  const series: { day: string; orders: number; revenue: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const [y, m, d] = key.split("-").map(Number);
    idx.set(key, series.length);
    series.push({ day: `${SHORT_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`, orders: 0, revenue: 0 });
  }
  for (const o of live) {
    const i = idx.get(ukParts(o.createdAt).dateKey);
    if (i !== undefined) { series[i].orders += 1; if (o.status === "completed") series[i].revenue += o.total; }
  }

  const dishCounts = new Map<string, number>();
  for (const o of live) for (const l of o.lines) dishCounts.set(l.name, (dishCounts.get(l.name) ?? 0) + l.qty);

  return NextResponse.json({
    kpis: {
      revenue: Math.round(revenue),
      orders: live.length,
      aov: completed.length ? Math.round((revenue / completed.length) * 100) / 100 : 0,
      repeatPct: pct(repeat, byPhone.size) ?? 0,
      covers: bookingsWeek.filter((b) => !["cancelled", "no-show"].includes(b.status)).reduce((s, b) => s + b.party, 0),
      noShowPct: pct(noShows, pastTotal),
      voucherRedemptionPct: pct(live.filter((o) => o.discount > 0).length, live.length) ?? 0,
      abandonPct: begun >= 10 ? Math.max(0, 100 - (pct(placed, begun) ?? 0)) : null, // needs analytics consent data
      cancelled: orders.length - live.length,
    },
    series: series.map((s) => ({ ...s, revenue: Math.round(s.revenue) })),
    dishes: [...dishCounts.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 6),
    split: [
      { name: "Delivery", value: live.filter((o) => o.fulfilment === "delivery").length },
      { name: "Collection", value: live.filter((o) => o.fulfilment === "collection").length },
    ],
    recentOrders: canAccess("orders", u.role, perms)
      ? orders.slice(0, 6).map((o) => ({ id: o.id, name: o.customerName, fulfilment: o.fulfilment, items: o.lines.length, status: o.status, total: o.total }))
      : null,
    todaysBookings: canAccess("bookings", u.role, perms)
      ? bookingsWeek.filter((b) => b.date === today).slice(0, 12).map((b) => ({ id: b.id, time: b.time, name: b.name, party: b.party, occasion: b.occasion, status: b.status }))
      : null,
    menuCount: MENU.length,
  });
}
