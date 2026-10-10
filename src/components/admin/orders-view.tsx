"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Check, X, Clock, Printer, Volume2, VolumeX, PauseCircle, PlayCircle, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, OrderStatusPill } from "@/components/admin/ui";
import { fetchOrdersFeed, patchOrderStatus, reprintOrder, setOrdersPaused } from "@/lib/admin/api";
import { type PlacedOrder } from "@/lib/order";
import { type OrderStatus } from "@/lib/data/site";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const LATE_MS = 5 * 60_000;

const FILTERS: { id: OrderStatus | "all" | "active"; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "preparing", label: "Preparing" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const FLAG_LABEL: Record<string, string> = {
  "new-customer": "New customer - call to confirm",
  "address-unverified": "Postcode not verified",
  "large-order": "Large order - call to confirm",
  "paid-after-cancel": "Paid after cancel - refund",
};

function nextStatus(o: PlacedOrder): OrderStatus | null {
  switch (o.status) {
    case "received": return "preparing";
    case "preparing": return o.fulfilment === "delivery" ? "out-for-delivery" : "ready-for-collection";
    case "out-for-delivery": return "completed";
    case "ready-for-collection": return "completed";
    default: return null;
  }
}

// A short two-tone chime made in the browser (no sound file needed).
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25); o.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
  } catch { /* no audio */ }
}

const isActive = (o: PlacedOrder) => !["completed", "cancelled"].includes(o.status);
const isLate = (o: PlacedOrder, now: number) => o.status === "received" && o.when === "asap" && now - o.createdAt > LATE_MS;
const printProblem = (o: PlacedOrder, now: number) =>
  isActive(o) && (o.paymentMethod !== "wechat" || o.paymentStatus === "paid") &&
  (o.printStatus === "failed" || (o.printStatus === "pending" && now - o.createdAt > 2 * 60_000));

export function OrdersView() {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [days, setDays] = useState(2);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // search, debounced
  const [detail, setDetail] = useState<PlacedOrder | null>(null);
  const [cancelling, setCancelling] = useState<PlacedOrder | null>(null);
  const [reason, setReason] = useState("");
  const [sound, setSound] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("ss_admin_sound") === "1"; } catch { return false; } });
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Set<string> | null>(null);

  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 400); return () => clearTimeout(t); }, [search]);
  // Changing the search or date range isn't "new orders": don't chime for what it brings in.
  useEffect(() => { known.current = null; }, [days, query]);

  const load = useCallback(async () => {
    const feed = await fetchOrdersFeed({ days, q: query || undefined });
    if (!feed) { setOffline(true); return; }
    setOffline(false);
    setOrders(feed.orders);
    setPaused(feed.paused);
    setReady(true);
    setNow(Date.now());
    // New orders since the last check: chime + toast (not on the first load).
    const ids = new Set(feed.orders.map((o) => o.id));
    if (known.current) {
      const fresh = feed.orders.filter((o) => !known.current!.has(o.id) && o.status === "received");
      if (fresh.length) {
        toast.success(`${fresh.length} new order${fresh.length > 1 ? "s" : ""}: ${fresh.map((o) => o.id).join(", ")}`);
        if (sound) chime();
      }
    }
    known.current = ids;
  }, [days, query, sound]);

  // Live updates: poll every 10 s and whenever the tab comes back into view.
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const activeCount = orders.filter(isActive).length;
  const waiting = orders.filter((o) => isLate(o, now)).length;
  const printIssues = orders.filter((o) => printProblem(o, now)).length;

  // Tab title shows how many orders need attention, so a backgrounded tab still catches the eye.
  useEffect(() => {
    const n = orders.filter((o) => o.status === "received").length;
    document.title = n ? `(${n}) Orders · Sambal & Sakura` : "Orders · Sambal & Sakura";
  }, [orders]);

  const rows = useMemo(() => {
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "all") return sorted;
    if (filter === "active") return sorted.filter(isActive);
    return sorted.filter((o) => o.status === filter);
  }, [orders, filter]);

  function replace(updated: PlacedOrder) {
    setOrders((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    setDetail((d) => (d && d.id === updated.id ? updated : d));
  }

  async function advance(o: PlacedOrder) {
    const ns = nextStatus(o);
    if (!ns) return;
    const r = await patchOrderStatus(o.id, ns);
    if (r.order) { replace(r.order); toast.success(`${o.id} → ${ns.replace(/-/g, " ")}`); }
    else { toast.error(r.error ?? "Could not update order."); void load(); }
  }
  async function confirmCancel() {
    if (!cancelling) return;
    const r = await patchOrderStatus(cancelling.id, "cancelled", reason.trim() || undefined);
    if (r.order) { replace(r.order); toast(`${cancelling.id} cancelled`); }
    else toast.error(r.error ?? "Could not cancel.");
    setCancelling(null); setReason("");
  }
  async function togglePause() {
    const next = !paused;
    if (next && !window.confirm("Pause ALL new online orders? Customers will be asked to phone instead.")) return;
    const r = await setOrdersPaused(next);
    if (r === null) { toast.error("Could not change ordering."); return; }
    setPaused(r);
    toast(r ? "Online orders paused" : "Online orders are back on");
  }
  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem("ss_admin_sound", next ? "1" : "0"); } catch { /* ignore */ }
    if (next) chime(); // also unlocks audio in the browser (needs a tap)
  }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">{activeCount} active · {orders.length} shown · updates every 10 seconds</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9 gap-1.5" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} {sound ? "Sound on" : "Turn sound on"}
          </Button>
          <Button variant={paused ? "default" : "outline"} className={cn("h-9 gap-1.5", !paused && "border-sambal/40 text-sambal")} onClick={togglePause}>
            {paused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />} {paused ? "Resume online orders" : "Pause online orders"}
          </Button>
        </div>
      </div>

      {paused && <Banner tone="sambal">Online ordering is PAUSED. Customers see a message asking them to phone.</Banner>}
      {offline && <Banner tone="sambal">Can&apos;t reach the server - check the internet connection. Showing the last orders loaded.</Banner>}
      {waiting > 0 && <Banner tone="sambal">{waiting} order{waiting > 1 ? "s have" : " has"} been waiting over 5 minutes. Start {waiting > 1 ? "them" : "it"} or call the customer.</Banner>}
      {printIssues > 0 && <Banner tone="gold">{printIssues} order{printIssues > 1 ? "s" : ""} didn&apos;t print. Check the printer, then use Reprint (it retries automatically too).</Banner>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition", filter === f.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
              {f.label}
            </button>
          ))}
        </div>
        <select aria-label="How far back" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-full border border-border bg-background px-3 text-sm">
          <option value={2}>Last 2 days</option><option value={7}>Last 7 days</option><option value={31}>Last 31 days</option>
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no., phone or name" className="h-9 w-56 pl-8" />
        </div>
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const ns = nextStatus(o);
                const late = isLate(o, now);
                return (
                  <TableRow key={o.id} className={cn("cursor-pointer", late && "bg-sambal/5")} onClick={() => setDetail(o)}>
                    <TableCell className="font-medium">
                      {o.id}
                      <span className={cn("block text-xs", late ? "font-semibold text-sambal" : "text-muted-foreground")}>
                        {new Date(o.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {o.when === "scheduled" && o.scheduledTime ? ` · for ${o.scheduledTime}` : late ? " · waiting" : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      {o.customer.name}
                      {(o.flags ?? []).map((f) => FLAG_LABEL[f] && <span key={f} className="mt-0.5 block text-[11px] font-semibold text-sambal">{FLAG_LABEL[f]}</span>)}
                    </TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">{o.fulfilment}</TableCell>
                    <TableCell className="hidden md:table-cell">{o.lines.reduce((n, l) => n + l.qty, 0)}</TableCell>
                    <TableCell className="font-semibold">{gbp(o.total)}</TableCell>
                    <TableCell>
                      <OrderStatusPill status={o.status} />
                      {o.paymentMethod === "wechat" && (
                        <span className={cn("mt-1 block text-[11px] font-semibold", o.paymentStatus === "paid" ? "text-jade" : "text-sambal")}>
                          WeChat · {o.paymentStatus === "paid" ? "PAID" : "awaiting payment"}
                        </span>
                      )}
                      {printProblem(o, now) && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-sambal" title={o.printError}><AlertTriangle className="size-3" /> Not printed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {ns ? (
                          <Button size="sm" className="h-8 gap-1" onClick={() => advance(o)}>
                            {ns === "completed" ? <Check className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            <span className="hidden sm:inline capitalize">{ns.replace(/-/g, " ")}</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        {isActive(o) && (
                          <Button size="icon-sm" variant="ghost" aria-label="Cancel order" onClick={() => { setCancelling(o); setReason(""); }}><X className="size-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No orders in this view.</p>}
        </div>
      </SectionCard>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Cancel {cancelling?.id}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Any points it earned are removed and a used voucher is given back.
            {cancelling?.paymentStatus === "paid" ? " This order was paid by WeChat: refund it in the WeChat Pay merchant platform." : ""}
          </p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. customer called, out of stock)" maxLength={200} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep order</Button>
            <Button variant="destructive" onClick={confirmCancel}>Cancel order</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between font-display">
                  {detail.id} <OrderStatusPill status={detail.status} />
                </DialogTitle>
              </DialogHeader>
              {(detail.flags ?? []).length > 0 && (
                <div className="rounded-lg bg-sambal/10 px-3 py-2 text-sm font-medium text-sambal">
                  {(detail.flags ?? []).map((f) => <p key={f}>{FLAG_LABEL[f] ?? f}</p>)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-9 w-fit gap-1.5" onClick={() => window.open(`/print/order/${detail.id}`, "_blank", "width=380,height=720")}>
                  <Printer className="size-4" /> Print ticket
                </Button>
                <Button
                  variant="outline"
                  className="h-9 w-fit gap-1.5"
                  onClick={async () => {
                    const r = await reprintOrder(detail.id);
                    if (r.ok) { toast.success("Sent to the kitchen printer"); void load(); } else toast.error(r.message);
                  }}
                >
                  <Printer className="size-4" /> Reprint to kitchen
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Kitchen printer: {detail.printStatus === "printed" ? "printed" : detail.printStatus === "failed" ? `failed - ${detail.printError ?? "unknown error"}` : detail.printStatus === "not-needed" ? "not used" : "waiting"}
              </p>
              <div className="text-sm">
                <p className="font-medium">{detail.customer.name} · <a className="underline" href={`tel:${detail.customer.phone}`}>{detail.customer.phone}</a></p>
                <p className="capitalize text-muted-foreground">{detail.fulfilment}{detail.customer.address ? ` · ${detail.customer.address}` : ""}{detail.customer.postcode ? ` (${detail.customer.postcode})` : ""}</p>
                {detail.when === "scheduled" && detail.scheduledTime && <p className="mt-1 font-semibold">For {detail.scheduledTime}</p>}
                {detail.customer.notes && <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" /> Customer note: {detail.customer.notes}</p>}
                {detail.cancelReason && <p className="mt-1 text-sambal">Cancelled: {detail.cancelReason}</p>}
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {detail.lines.map((l) => (
                    <li key={l.lineId} className="flex justify-between py-2">
                      <span>{l.qty}× {l.name}{l.modifiers.length ? <span className="text-muted-foreground"> · {l.modifiers.map((m) => m.label).join(", ")}</span> : null}</span>
                      <span className="font-medium">{l.unitPrice === 0 ? "Free" : gbp(l.unitPrice * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{gbp(detail.subtotal)}</dd></div>
                  {detail.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{gbp(detail.deliveryFee)}</dd></div>}
                  {detail.discount > 0 && <div className="flex justify-between text-jade"><dt>Discount{detail.voucherCode ? ` (${detail.voucherCode})` : ""}</dt><dd>− {gbp(detail.discount)}</dd></div>}
                  <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>{detail.paymentMethod === "wechat" ? `Total (WeChat · ${detail.paymentStatus === "paid" ? "PAID" : "awaiting payment"})` : "Total (cash)"}</dt><dd className="font-display text-lg">{gbp(detail.total)}</dd></div>
                </dl>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Banner({ tone, children }: { tone: "sambal" | "gold"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium", tone === "sambal" ? "border-sambal/30 bg-sambal/10 text-sambal" : "border-gold/40 bg-gold/10 text-gold-ink")}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{children}</span>
    </div>
  );
}
