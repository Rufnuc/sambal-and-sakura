"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatCard, SectionCard, OrderStatusPill, BookingStatusPill } from "@/components/admin/ui";
import { fetchOrders, fetchBookings } from "@/lib/admin/api";
import { ordersByDay, popularDishes, fulfilmentSplit, computeKpis, MENU_COUNT, type Kpis } from "@/lib/admin/metrics";
import { type PlacedOrder } from "@/lib/order";
import { type Booking } from "@/lib/booking";
import { gbp } from "@/lib/format";

const revenueConfig = {
  revenue: { label: "Revenue (£)", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-4)" },
} satisfies ChartConfig;

const dishConfig = { qty: { label: "Ordered", color: "var(--chart-1)" } } satisfies ChartConfig;

const PIE_COLORS = ["var(--chart-1)", "var(--chart-4)"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Dashboard() {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([fetchOrders(), fetchBookings()]).then(([o, b]) => {
      setOrders(o);
      setBookings(b);
      setReady(true);
    });
  }, []);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const kpis: Kpis = computeKpis(orders, bookings);
  const revSeries = ordersByDay(orders, 14);
  const dishes = popularDishes(orders, 6);
  const split = fulfilmentSplit(orders);
  const recentOrders = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const today = todayStr();
  const todaysBookings = bookings.filter((b) => b.date === today).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Last 14 days · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Revenue (14d)" value={gbp(kpis.revenue)} sub={`${kpis.orders} orders`} accent="gold" />
        <StatCard label="Avg order value" value={gbp(kpis.aov)} sub="per completed order" accent="jade" />
        <StatCard label="Direct orders" value={`${kpis.directPct}%`} sub="0% third-party fees" accent="jade" />
        <StatCard label="Repeat customers" value={`${kpis.repeatPct}%`} sub="ordered 2+ times" accent="sakura" />
        <StatCard label="Covers booked" value={String(kpis.covers)} sub="across the week" accent="gold" />
        <StatCard label="No-show rate" value={`${kpis.noShowPct}%`} sub="past reservations" accent="sambal" />
        <StatCard label="Voucher redemption" value={`${kpis.voucherRedemptionPct}%`} sub="orders with a code" accent="sakura" />
        <StatCard label="Cart abandonment" value={`${kpis.abandonPct}%`} sub="begin → placed" accent="sambal" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Revenue & orders" className="lg:col-span-2">
          <ChartContainer config={revenueConfig} className="h-64 w-full">
            <AreaChart data={revSeries} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={34} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="url(#fillRev)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard title="Delivery vs collection">
          <ChartContainer config={{}} className="mx-auto aspect-square h-56">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                {split.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-2 flex justify-center gap-4 text-sm">
            {split.map((s, i) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} /> {s.name} ({s.value})
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Most popular dishes">
          <ChartContainer config={dishConfig} className="h-64 w-full">
            <BarChart data={dishes} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="qty" fill="var(--color-qty)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard title="Recent orders" action={<Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-medium text-gold-ink hover:underline">All <ArrowUpRight className="size-4" /></Link>}>
          <ul className="divide-y divide-border">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.id} · {o.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{o.fulfilment} · {o.lines.length} items</p>
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusPill status={o.status} />
                  <span className="w-16 text-right text-sm font-semibold">{gbp(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Today's bookings" action={<Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-gold-ink hover:underline">Manage <ArrowUpRight className="size-4" /></Link>}>
        {todaysBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings for today yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todaysBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{b.time} · {b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.party} guests{b.occasion ? ` · ${b.occasion}` : ""}</p>
                </div>
                <BookingStatusPill status={b.status} />
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Menu items live: {MENU_COUNT}</p>
      </SectionCard>
    </div>
  );
}
