"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList } from "recharts";
import { Activity } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchAnalytics } from "@/lib/admin/api";
import { ANALYTICS_EVENTS, type AnalyticsEvent } from "@/lib/data/site";

const funnelConfig = { count: { label: "Events", color: "var(--chart-1)" } } satisfies ChartConfig;

const FUNNEL: AnalyticsEvent[] = ["view_menu", "add_to_cart", "begin_checkout", "order_placed"];
const LABELS: Record<AnalyticsEvent, string> = {
  view_menu: "Viewed menu",
  add_to_cart: "Added to cart",
  begin_checkout: "Began checkout",
  order_placed: "Placed order",
  booking_started: "Started booking",
  booking_confirmed: "Confirmed booking",
  spin_wheel_played: "Spun wheel",
  voucher_redeemed: "Redeemed voucher",
  dish_assistant_ask: "Asked dish AI",
};

// Real events from every visitor who accepted analytics cookies (stored on our server, 90 days).
export function AnalyticsView() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<{ counts: Record<string, number>; recent: { name: string; createdAt: string }[] } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchAnalytics(days).then((d) => { setData(d); setReady(true); });
  }, [days]);

  const counts = useMemo(() => new Map<AnalyticsEvent, number>(Object.entries(data?.counts ?? {}) as [AnalyticsEvent, number][]), [data]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const funnelData = FUNNEL.map((id) => ({ step: LABELS[id], count: counts.get(id) ?? 0 }));
  const views = counts.get("view_menu") ?? 0;
  const carts = counts.get("add_to_cart") ?? 0;
  const checkouts = counts.get("begin_checkout") ?? 0;
  const placed = counts.get("order_placed") ?? 0;
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const recent = (data?.recent ?? []).map((e) => ({ name: e.name, ts: Date.parse(e.createdAt) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Visitors who accepted analytics cookies · last {days} days</p>
      </div>
      <div className="flex gap-2">
        {[7, 14, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${days === d ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}>{d} days</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Menu views" value={String(views)} accent="gold" />
        <StatCard label="Add-to-cart rate" value={`${rate(carts, views)}%`} sub="of menu views" accent="jade" />
        <StatCard label="Checkout rate" value={`${rate(checkouts, carts)}%`} sub="of carts" accent="sakura" />
        <StatCard label="Order conversion" value={`${rate(placed, checkouts)}%`} sub="of checkouts" accent="sambal" />
      </div>

      <SectionCard title="Conversion funnel">
        <ChartContainer config={funnelConfig} className="h-64 w-full">
          <BarChart data={funnelData} margin={{ top: 16, left: 4, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="step" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={28} fontSize={11} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]}>
              <LabelList dataKey="count" position="top" className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
        <p className="mt-2 text-xs text-muted-foreground">Only counts visitors who accepted analytics cookies, so real totals are higher. Orders and bookings themselves are always exact on the Dashboard.</p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="All tracked events">
          <ul className="divide-y divide-border">
            {ANALYTICS_EVENTS.map((e) => (
              <li key={e} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-muted-foreground">{e}</span>
                <span className="font-semibold tabular-nums">{counts.get(e) ?? 0}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Recent activity" action={<Activity className="size-4 text-jade" />}>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events in this period yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recent.map((e, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-mono">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
