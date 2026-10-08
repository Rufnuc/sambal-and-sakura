"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchCustomers, type AdminCustomer } from "@/lib/admin/api";
import { tierFor } from "@/lib/store/auth";
import { gbp } from "@/lib/format";

export function CustomersView() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"spend" | "points" | "orders" | "name" | "recent">("spend");
  const [ready, setReady] = useState(false);

  useEffect(() => { fetchCustomers().then((c) => { setCustomers(c); setReady(true); }); }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = customers
      .map((c) => ({ ...c, tier: tierFor(c.points).current.name }))
      .filter((c) => !q || `${c.name} ${c.email}`.toLowerCase().includes(q));
    const cmp: Record<typeof sort, (a: typeof list[number], b: typeof list[number]) => number> = {
      spend: (a, b) => b.spend - a.spend,
      points: (a, b) => b.points - a.points,
      orders: (a, b) => b.orders - a.orders,
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    };
    return [...list].sort(cmp[sort]);
  }, [customers, query, sort]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const withOrders = rows.filter((r) => r.orders > 0).length;
  const totalPoints = customers.reduce((n, c) => n + c.points, 0);
  const totalSpend = rows.reduce((n, r) => n + r.spend, 0);
  const avgSpend = withOrders ? totalSpend / withOrders : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Customers</h1>
        <p className="text-muted-foreground">{customers.length} members · {withOrders} with orders</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Members" value={String(customers.length)} accent="gold" />
        <StatCard label="Active (ordered)" value={String(withOrders)} accent="jade" />
        <StatCard label="Points issued" value={totalPoints.toLocaleString()} accent="sakura" />
        <StatCard label="Avg member spend" value={gbp(avgSpend)} accent="gold" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members…" className="h-11 pl-9" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="spend">Top spend</option>
          <option value="points">Most points</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
          <option value="recent">Newest</option>
        </select>
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}<span className="block text-xs text-muted-foreground">{c.email}</span></TableCell>
                  <TableCell><Badge variant="outline" className="gap-1 border-gold/30 bg-gold/10 text-gold-ink"><Crown className="size-3" /> {c.tier}</Badge></TableCell>
                  <TableCell className="tabular-nums">{c.points.toLocaleString()}</TableCell>
                  <TableCell>{c.orders}</TableCell>
                  <TableCell className="font-semibold">{gbp(c.spend)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No members yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
