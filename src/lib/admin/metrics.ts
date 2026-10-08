import type { PlacedOrder } from "@/lib/order";
import type { Booking } from "@/lib/booking";
import { MENU } from "@/lib/data/menu";

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

export function ordersByDay(orders: PlacedOrder[], days = 14) {
  const buckets = new Map<string, { day: string; orders: number; revenue: number; ts: number }>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
    buckets.set(d.toDateString(), { day: dayLabel(d.getTime()), orders: 0, revenue: 0, ts: d.getTime() });
  }
  for (const o of orders) {
    const key = new Date(new Date(o.createdAt).setHours(0, 0, 0, 0)).toDateString();
    const b = buckets.get(key);
    if (b) { b.orders += 1; b.revenue += o.total; }
  }
  return [...buckets.values()].map((b) => ({ ...b, revenue: Math.round(b.revenue) }));
}

export function popularDishes(orders: PlacedOrder[], top = 6) {
  const counts = new Map<string, number>();
  for (const o of orders) for (const l of o.lines) counts.set(l.name, (counts.get(l.name) ?? 0) + l.qty);
  return [...counts.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, top);
}

export function fulfilmentSplit(orders: PlacedOrder[]) {
  let delivery = 0, collection = 0;
  for (const o of orders) (o.fulfilment === "delivery" ? (delivery += 1) : (collection += 1));
  return [
    { name: "Delivery", value: delivery },
    { name: "Collection", value: collection },
  ];
}

export function bookingsByDay(bookings: Booking[], days = 7) {
  const buckets = new Map<string, { day: string; bookings: number; covers: number }>();
  const now = new Date();
  for (let i = -(days - 3); i <= 3; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    buckets.set(key, { day: d.toLocaleDateString("en-GB", { weekday: "short" }), bookings: 0, covers: 0 });
  }
  for (const b of bookings) {
    const bucket = buckets.get(b.date);
    if (bucket && b.status !== "cancelled") { bucket.bookings += 1; bucket.covers += b.party; }
  }
  return [...buckets.values()];
}

export interface Kpis {
  revenue: number; orders: number; aov: number;
  directPct: number; repeatPct: number; abandonPct: number;
  noShowPct: number; waitlistConvPct: number; voucherRedemptionPct: number;
  covers: number;
}

export function computeKpis(orders: PlacedOrder[], bookings: Booking[]): Kpis {
  const completed = orders.filter((o) => o.status === "completed");
  const revenue = completed.reduce((s, o) => s + o.total, 0);
  const orderCount = orders.length;
  const aov = orderCount ? revenue / Math.max(1, completed.length) : 0;

  const names = new Map<string, number>();
  for (const o of orders) names.set(o.customer.name, (names.get(o.customer.name) ?? 0) + 1);
  const repeat = [...names.values()].filter((n) => n > 1).length;
  const repeatPct = names.size ? (repeat / names.size) * 100 : 0;

  const withVoucher = orders.filter((o) => o.discount > 0).length;
  const voucherRedemptionPct = orderCount ? (withVoucher / orderCount) * 100 : 0;

  const past = bookings.filter((b) => b.status === "completed" || b.status === "no-show");
  const noShow = bookings.filter((b) => b.status === "no-show").length;
  const noShowPct = past.length ? (noShow / past.length) * 100 : 0;
  const covers = bookings.filter((b) => b.status !== "cancelled").reduce((s, b) => s + b.party, 0);

  return {
    revenue: Math.round(revenue),
    orders: orderCount,
    aov: Math.round(aov * 100) / 100,
    directPct: 100, // all website orders are direct
    repeatPct: Math.round(repeatPct),
    abandonPct: 22, // demo benchmark - wire to begin_checkout vs order_placed in prod
    noShowPct: Math.round(noShowPct),
    waitlistConvPct: 61, // demo benchmark
    voucherRedemptionPct: Math.round(voucherRedemptionPct),
    covers,
  };
}

export const MENU_COUNT = MENU.length;
