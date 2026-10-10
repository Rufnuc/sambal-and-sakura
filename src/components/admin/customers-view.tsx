"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchCustomers, type AdminCustomer } from "@/lib/admin/api";
import { tierFor } from "@/lib/store/auth";
import { gbp } from "@/lib/format";

// Searched and paginated on the server (50 per page), so it stays fast with thousands of members.
export function CustomersView() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<"spend" | "points" | "orders" | "name" | "recent">("recent");
  const [ready, setReady] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setDebounced(query.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [query]);
  useEffect(() => {
    fetchCustomers(debounced, page).then((r) => { setCustomers(r.customers); setTotal(r.total); setPageSize(r.pageSize); setReady(true); });
  }, [debounced, page]);

  const rows = useMemo(() => {
    const list = customers.map((c) => ({ ...c, tier: tierFor(c.points).current.name }));
    const cmp: Record<typeof sort, (a: typeof list[number], b: typeof list[number]) => number> = {
      spend: (a, b) => b.spend - a.spend,
      points: (a, b) => b.points - a.points,
      orders: (a, b) => b.orders - a.orders,
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    };
    return [...list].sort(cmp[sort]);
  }, [customers, sort]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const withOrders = rows.filter((r) => r.orders > 0).length;
  const totalPoints = customers.reduce((n, c) => n + c.points, 0);
  const totalSpend = rows.reduce((n, r) => n + r.spend, 0);
  const avgSpend = withOrders ? totalSpend / withOrders : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Customers</h1>
        <p className="text-muted-foreground">{total} members{debounced ? " match" : ""} · page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Members" value={String(total)} accent="gold" />
        <StatCard label="Ordered (this page)" value={String(withOrders)} accent="jade" />
        <StatCard label="Points (this page)" value={totalPoints.toLocaleString()} accent="sakura" />
        <StatCard label="Avg spend (this page)" value={gbp(avgSpend)} accent="gold" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or phone…" className="h-11 pl-9" />
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
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{debounced ? "No members match." : "No members yet."}</p>}
        </div>
        {total > pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /> Previous</Button>
            <Button variant="outline" size="sm" className="h-8" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="size-4" /></Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
