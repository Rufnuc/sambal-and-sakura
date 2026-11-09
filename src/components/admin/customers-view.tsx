"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Crown, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { CustomerBalance } from "@/components/admin/customer-balance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchCustomers, unblockEmail, type AdminCustomer } from "@/lib/admin/api";
import { toast } from "sonner";
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
  const [balanceFor, setBalanceFor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { const t = setTimeout(() => { setDebounced(query.trim()); setPage(0); }, 350); return () => clearTimeout(t); }, [query]);
  useEffect(() => {
    fetchCustomers(debounced, page).then((r) => { setCustomers(r.customers); setTotal(r.total); setPageSize(r.pageSize); setReady(true); });
  }, [debounced, page, reload]); // reload: refetch after a balance change

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
                <TableHead>Prepaid balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}<span className="block text-xs text-muted-foreground">{c.email}</span>
                    {c.status === "deactivated" && <span className="block text-[11px] font-semibold text-sambal">Deactivated (can reactivate for 14 days)</span>}
                    {c.marketingOptIn && <span className="block text-[11px] font-semibold text-jade">Gets offers by email</span>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="gap-1 border-gold/30 bg-gold/10 text-gold-ink"><Crown className="size-3" /> {c.tier}</Badge></TableCell>
                  <TableCell className="tabular-nums">{c.points.toLocaleString()}</TableCell>
                  <TableCell>{c.orders}</TableCell>
                  <TableCell className="font-semibold">{gbp(c.spend)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setBalanceFor(c.id)}>
                      <Wallet className="size-3.5" />
                      {c.balanceStatus === "active" ? gbp(c.balance ?? 0) : c.balanceStatus === "offered" ? `Waiting · ${gbp(c.balance ?? 0)}` : c.balanceStatus === "declined" ? `Declined${c.balance ? ` · refund ${gbp(c.balance)}` : ""}` : "Balance"}
                    </Button>
                  </TableCell>
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

      <UnblockEmail />
      <CustomerBalance customerId={balanceFor} open={!!balanceFor} onOpenChange={(o) => { if (!o) setBalanceFor(null); }} onChanged={() => setReload((n) => n + 1)} />
    </div>
  );
}

/** Owner tool: closed accounts' emails can't sign up again; this lets one through (genuine mistakes only). */
function UnblockEmail() {
  const [email, setEmail] = useState("");
  return (
    <SectionCard title="Allow a closed account's email again">
      <p className="text-sm text-muted-foreground">When an account is closed (or not reactivated within 14 days), its email can&apos;t be used to sign up again. Only unblock it for a genuine mistake: they start again with no points.</p>
      <form className="mt-3 flex max-w-md gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const r = await unblockEmail(email.trim());
        if (!r.ok) toast.error(r.error);
        else if (r.removed) { toast.success("Done - that email can sign up again."); setEmail(""); }
        else toast("That email wasn't blocked.");
      }}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" className="h-10" required />
        <Button type="submit" variant="outline" className="h-10">Unblock</Button>
      </form>
    </SectionCard>
  );
}
