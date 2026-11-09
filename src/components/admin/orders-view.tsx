"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Check, X, Clock, Printer, Volume2, VolumeX, PauseCircle, PlayCircle, AlertTriangle, Search, MonitorSmartphone, Trash2 } from "lucide-react";
import { useWakeLock } from "@/lib/use-wake-lock";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SectionCard, OrderStatusPill } from "@/components/admin/ui";
import { fetchOrdersFeed, patchOrderStatus, reprintOrder, setOrdersPaused, fetchCancelCount, resetCancelCount, deleteTestOrders, type CancelKind } from "@/lib/admin/api";
import { usePrintStation, type PrintChoice } from "@/components/admin/print-station";
import { playAlarm, unlockAudio, audioLocked, ALARM_SOUNDS, isAlarmSound, type AlarmSound } from "@/lib/order-alarm";
import { type PlacedOrder } from "@/lib/order";
import { type OrderStatus } from "@/lib/data/site";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const ALARM_REPEAT_MS = 10_000; // repeat the alarm this often until a new order is accepted
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
  "address-unverified": "Postcode not verified",
  "large-order": "Large order - call to confirm",
  "paid-after-cancel": "Paid after cancel - refund",
  "frequent-canceller": "Cancels often - call to confirm",
};

const CANCEL_KINDS: { id: CancelKind; label: string; counts: boolean }[] = [
  { id: "staff", label: "Restaurant reason (out of stock, kitchen problem…)", counts: false },
  { id: "customer", label: "Customer asked to cancel", counts: true },
  { id: "no-show", label: "Not collected / customer didn't answer", counts: true },
];

// Customer cancellations staff have already seen (so the alarm shows once per order).
const ACK_KEY = "ss_admin_cancel_ack";
function readAcks(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]")); } catch { return new Set(); } }
function saveAcks(s: Set<string>) { try { localStorage.setItem(ACK_KEY, JSON.stringify([...s].slice(-200))); } catch { /* ignore */ } }

function nextStatus(o: PlacedOrder): OrderStatus | null {
  switch (o.status) {
    case "received": return "preparing";
    case "preparing": return o.fulfilment === "delivery" ? "out-for-delivery" : "ready-for-collection";
    case "out-for-delivery": return "completed";
    case "ready-for-collection": return "completed";
    default: return null;
  }
}

const isActive = (o: PlacedOrder) => !["completed", "cancelled"].includes(o.status);
const isLate = (o: PlacedOrder, now: number) => o.status === "received" && o.when === "asap" && now - o.createdAt > LATE_MS;
const printProblem = (o: PlacedOrder, now: number) =>
  isActive(o) && (o.paymentMethod !== "wechat" || o.paymentStatus === "paid") &&
  (o.printStatus === "failed" || (o.printStatus === "pending" && now - o.createdAt > 2 * 60_000));

export function OrdersView({ isOwner = false }: { isOwner?: boolean }) {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  // Owner clean-up: pick test orders, then delete them together (one password).
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deletingNow, setDeletingNow] = useState(false);
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
  const [cancelKind, setCancelKind] = useState<CancelKind>("staff");
  const [acks, setAcks] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readAcks()));
  const [custCancels, setCustCancels] = useState<{ count: number; windowDays: number; flagAt: number } | null>(null);
  // The order alarm is on unless staff switch it off on this device.
  const [sound, setSound] = useState(() => { try { return typeof window === "undefined" || localStorage.getItem("ss_admin_sound") !== "0"; } catch { return true; } });
  const [alarmSound, setAlarmSound] = useState<AlarmSound>(() => { try { const v = localStorage.getItem("ss_admin_alarm"); return isAlarmSound(v) ? v : "alarm"; } catch { return "alarm"; } });
  const [volume, setVolume] = useState(() => { try { const v = Number(localStorage.getItem("ss_admin_volume")); return v > 0 && v <= 1 ? v : 1; } catch { return 1; } });
  const chime = useCallback(() => playAlarm(alarmSound, volume), [alarmSound, volume]);
  const [now, setNow] = useState(() => Date.now());
  // Keep the tablet's screen on while this page is open (on by default; remembered per device).
  const [awake, setAwake] = useState(() => { try { return typeof window === "undefined" || localStorage.getItem("ss_admin_awake") !== "0"; } catch { return true; } });
  const wake = useWakeLock(awake);
  const [audioReady, setAudioReady] = useState(false); // a tap has unlocked sound on this page
  // Kitchen printer plugged into THIS tablet by USB: prints new orders (and STOP tickets) automatically.
  // (printing itself runs in PrintStation around every admin page, see print-station.tsx)
  const station = usePrintStation();
  const known = useRef<Set<string> | null>(null);
  const alarmed = useRef<Set<string>>(new Set());

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
    // Customer cancelled from their tracking page: alarm until staff tap "Got it".
    const fresh = feed.orders.filter((o) => o.status === "cancelled" && o.cancelKind === "customer" && (o.cancelledAt ?? 0) > Date.now() - 2 * 3600_000);
    const unseen = fresh.filter((o) => !readAcks().has(o.id) && !alarmed.current.has(o.id));
    if (unseen.length) {
      unseen.forEach((o) => alarmed.current.add(o.id));
      toast.error(`CUSTOMER CANCELLED ${unseen.map((o) => o.id).join(", ")} - stop preparing`, { duration: 20_000 });
      if (sound) { chime(); setTimeout(chime, 700); }
    }
  }, [days, query, sound, chime]);

  // Live updates: poll every 10 s, even in a background tab (browsers slow that to about once a
  // minute, which still catches new orders), and straight away when the tab comes back into view
  // or the internet connection returns.
  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, POLL_MS);
    const now = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", now);
    window.addEventListener("online", now);
    window.addEventListener("focus", now);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", now); window.removeEventListener("online", now); window.removeEventListener("focus", now); };
  }, [load]);

  // Sound needs one tap after the page loads (browser rule). Ask for it, and unlock on the first tap.
  const soundLocked = sound && !audioReady;
  useEffect(() => {
    if (!sound) return;
    const unlock = () => { unlockAudio(); setTimeout(() => setAudioReady(!audioLocked()), 100); };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => { document.removeEventListener("pointerdown", unlock); document.removeEventListener("keydown", unlock); };
  }, [sound]);

  // Keep alarming every 10 s while a new order hasn't been accepted (moved past "received"), or a
  // customer cancellation hasn't been acknowledged - so a busy kitchen can't miss it.
  const newWaiting = orders.some((o) => o.status === "received" && (o.paymentMethod !== "wechat" || o.paymentStatus === "paid"));
  const needsAttention = newWaiting || orders.some((o) =>
    (o.status === "cancelled" && o.cancelKind === "customer" && (o.cancelledAt ?? 0) > now - 2 * 3600_000 && !acks.has(o.id)));
  useEffect(() => {
    if (!needsAttention) return;
    const id = setInterval(() => {
      if (sound) chime();
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ }
    }, ALARM_REPEAT_MS);
    return () => clearInterval(id);
  }, [needsAttention, sound, chime]);

  // While something needs attention, the browser tab flashes too (seen from another tab or window).
  useEffect(() => {
    if (!needsAttention) return;
    const original = document.title;
    let on = false;
    const id = setInterval(() => { on = !on; document.title = on ? "🔔 NEW ORDER - Sambal & Sakura" : original; }, 1000);
    return () => { clearInterval(id); document.title = original; };
  }, [needsAttention]);

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

  // When an order is opened, look up how often this customer has cancelled recently.
  useEffect(() => {
    setCustCancels(null);
    if (!detail) return;
    let live = true;
    fetchCancelCount(detail.id).then((r) => { if (live && r) setCustCancels({ count: r.count, windowDays: r.policy.windowDays, flagAt: r.policy.flagAt }); });
    return () => { live = false; };
  }, [detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const r = await patchOrderStatus(cancelling.id, "cancelled", reason.trim() || undefined, cancelKind);
    if (r.order) { replace(r.order); toast(`${cancelling.id} cancelled`); }
    else toast.error(r.error ?? "Could not cancel.");
    setCancelling(null); setReason("");
  }
  function togglePicked(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function runDelete() {
    setDeletingNow(true);
    const r = await deleteTestOrders([...picked], deletePw);
    setDeletingNow(false);
    if ("error" in r) { toast.error(r.error); return; }
    setConfirmDelete(false); setDeletePw("");
    if (r.deleted.length) toast.success(`Deleted ${r.deleted.length} test order${r.deleted.length === 1 ? "" : "s"}`);
    for (const f of r.refused) toast.error(`${f.id}: ${f.error}`, { duration: 12_000 });
    if (r.referrerRewardKept) toast("A referrer had already used the reward from one of these orders, so that reward was kept.", { duration: 12_000 });
    setPicked(new Set(r.refused.map((f) => f.id)));
    if (!r.refused.length) setSelecting(false);
    void load();
  }
  async function togglePause() {
    const next = !paused;
    if (next && !window.confirm("Pause ALL new online orders? Customers will be asked to phone instead.")) return;
    const r = await setOrdersPaused(next);
    if (r === null) { toast.error("Could not change ordering."); return; }
    setPaused(r);
    toast(r ? "Online orders paused" : "Online orders are back on");
  }
  function toggleAwake() {
    const next = !awake;
    setAwake(next);
    try { localStorage.setItem("ss_admin_awake", next ? "1" : "0"); } catch { /* ignore */ }
  }
  function pickSound(v: AlarmSound) {
    setAlarmSound(v);
    try { localStorage.setItem("ss_admin_alarm", v); } catch { /* ignore */ }
    playAlarm(v, volume); // let staff hear it straight away
  }
  function pickVolume(v: number) {
    setVolume(v);
    try { localStorage.setItem("ss_admin_volume", String(v)); } catch { /* ignore */ }
  }
  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem("ss_admin_sound", next ? "1" : "0"); } catch { /* ignore */ }
    if (next) { chime(); setTimeout(() => setAudioReady(!audioLocked()), 100); } // the tap also unlocks audio
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
          {sound && (
            <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm">
              <label className="sr-only" htmlFor="alarm-sound">Order alert sound</label>
              <select id="alarm-sound" value={alarmSound} onChange={(e) => pickSound(e.target.value as AlarmSound)} className="h-7 rounded bg-background text-sm">
                {ALARM_SOUNDS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <label className="sr-only" htmlFor="alarm-volume">Volume</label>
              <input id="alarm-volume" type="range" min={0.1} max={1} step={0.1} value={volume} onChange={(e) => pickVolume(Number(e.target.value))} onPointerUp={() => chime()} className="w-20 accent-current" title="Volume (also turn the device volume up)" />
              <button type="button" className="text-xs underline" onClick={() => chime()}>Test</button>
            </div>
          )}
          {wake !== "unsupported" && (
            <Button variant="outline" className="h-9 gap-1.5" onClick={toggleAwake} aria-pressed={awake} title="Stops this screen going to sleep while the Orders page is open">
              <MonitorSmartphone className="size-4" /> {awake ? (wake === "on" ? "Screen stays on" : "Screen on: tap the page") : "Keep screen on"}
            </Button>
          )}
          {isOwner && (
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => { setSelecting((v) => !v); setPicked(new Set()); }}>
              <Trash2 className="size-4" /> {selecting ? "Stop deleting" : "Delete test orders"}
            </Button>
          )}
          <Button variant={paused ? "default" : "outline"} className={cn("h-9 gap-1.5", !paused && "border-sambal/40 text-sambal")} onClick={togglePause}>
            {paused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />} {paused ? "Resume online orders" : "Pause online orders"}
          </Button>
        </div>
      </div>

      {orders.filter((o) => o.status === "cancelled" && o.cancelKind === "customer" && (o.cancelledAt ?? 0) > now - 2 * 3600_000 && !acks.has(o.id)).map((o) => (
        <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sambal bg-sambal px-4 py-3 text-white">
          <span className="font-bold">CUSTOMER CANCELLED {o.id} ({o.customer.name}) - STOP PREPARING{o.cancelReason ? ` · ${o.cancelReason.replace(/^Customer: /, "")}` : ""}</span>
          <Button size="sm" variant="secondary" className="h-8" onClick={() => { const n = new Set(acks); n.add(o.id); setAcks(n); saveAcks(n); }}>Got it</Button>
        </div>
      ))}
      {paused && <Banner tone="sambal">Online ordering is PAUSED. Customers see a message asking them to phone.</Banner>}
      {station && <TabletPrinterBar station={station} />}

      {sound && soundLocked && <Banner tone="sambal">Tap anywhere on this page to switch the order alarm on (the browser needs one tap after the page opens).</Banner>}
      {newWaiting && <Banner tone="sambal">New order waiting: the alarm repeats every 10 seconds until it&apos;s accepted (moved to Preparing).</Banner>}
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no., name, phone, email or postcode" aria-label="Search orders" className="h-9 w-64 pl-8" />
        </div>
      </div>

      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-sambal/50 bg-sambal/5 px-3 py-2 text-sm">
          <span className="mr-auto">
            Tap each <strong>test</strong> order to select it. Tip: choose &quot;All&quot; and &quot;Last 31 days&quot;, or search your own phone number or email to find them.
            Orders paid online can&apos;t be deleted.
          </span>
          <Button size="sm" variant="destructive" className="h-8 gap-1.5" disabled={!picked.size} onClick={() => { setDeletePw(""); setConfirmDelete(true); }}>
            <Trash2 className="size-4" /> Delete {picked.size || ""} order{picked.size === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      <SectionCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {selecting && <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>}
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
                  <TableRow key={o.id} className={cn("cursor-pointer", late && "bg-sambal/5", selecting && picked.has(o.id) && "bg-sambal/10")}
                    onClick={() => (selecting ? togglePicked(o.id) : setDetail(o))}>
                    {selecting && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="size-4" aria-label={`Select ${o.id} to delete`} checked={picked.has(o.id)} disabled={o.paymentStatus === "paid"} onChange={() => togglePicked(o.id)} />
                      </TableCell>
                    )}
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
                          <Button size="icon-sm" variant="ghost" aria-label="Cancel order" onClick={() => { setCancelling(o); setReason(""); setCancelKind("staff"); }}><X className="size-4" /></Button>
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

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && !deletingNow && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Delete {picked.size} test order{picked.size === 1 ? "" : "s"} for good?</DialogTitle>
            <DialogDescription>
              They disappear from Orders, stats and reports, and their tracking links stop working. Points they earned are taken back, vouchers they used are returned,
              and a referral they completed goes back to waiting. This can&apos;t be undone, so only delete orders that were tests.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{[...picked].join(", ")}</p>
          <form onSubmit={(e) => { e.preventDefault(); void runDelete(); }} className="flex flex-col gap-3">
            <Input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} placeholder="Your password" aria-label="Your password" autoComplete="current-password" required />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deletingNow} onClick={() => setConfirmDelete(false)}>Keep them</Button>
              <Button type="submit" variant="destructive" disabled={deletingNow || !deletePw}>{deletingNow ? "Deleting…" : "Delete for good"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Cancel {cancelling?.id}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Any points it earned are removed and a used voucher is given back.
            {cancelling?.paymentStatus === "paid" ? " This order was paid by WeChat: refund it in the WeChat Pay merchant platform." : ""}
          </p>
          <div className="flex flex-col gap-2">
            {CANCEL_KINDS.map((k) => (
              <label key={k.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm", cancelKind === k.id ? "border-foreground" : "border-border")}>
                <input type="radio" name="cancel-kind" checked={cancelKind === k.id} onChange={() => setCancelKind(k.id)} className="mt-0.5" />
                <span>{k.label}{k.counts && <span className="block text-xs text-muted-foreground">Counts towards this customer&apos;s cancellation limit</span>}</span>
              </label>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Details (optional, shown to the customer)" maxLength={200} />
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
                    if (station?.printer.state === "connected") {
                      // This device's printer: reprint here.
                      try { await station.printTicket({ orderId: detail.id, kind: detail.status === "cancelled" ? "cancel" : "order" }); toast.success("Printed on this device's printer"); } catch (e) { toast.error((e as Error).message); }
                      return;
                    }
                    const r = await reprintOrder(detail.id);
                    if (r.ok) { toast.success("Sent to the kitchen printer"); void load(); } else toast.error(r.message);
                  }}
                >
                  <Printer className="size-4" /> Reprint to kitchen
                </Button>
                {station?.printer.state === "connected" && (
                  <Button variant="outline" className="h-9 w-fit gap-1.5" onClick={async () => {
                    try { await station.printTicket({ orderId: detail.id, kind: "receipt" }); toast.success("Customer receipt printed"); } catch (e) { toast.error((e as Error).message); }
                  }}>
                    <Printer className="size-4" /> Print customer receipt
                  </Button>
                )}
              </div>
              {custCancels && custCancels.count > 0 && (
                <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm", custCancels.count >= custCancels.flagAt ? "bg-sambal/10 text-sambal" : "bg-muted")}>
                  <span>This customer cancelled or didn&apos;t collect {custCancels.count} order{custCancels.count > 1 ? "s" : ""} in the last {custCancels.windowDays} days.</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={async () => {
                    const r = await resetCancelCount(detail.id);
                    if (r.ok) { toast.success("Reset - their past cancellations no longer count."); setCustCancels({ ...custCancels, count: 0 }); } else toast.error(r.error);
                  }}>Reset</Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Kitchen printer: {detail.printStatus === "printed" ? "printed" : detail.printStatus === "failed" ? `failed - ${detail.printError ?? "unknown error"}` : detail.printStatus === "not-needed" ? "not used" : "waiting"}
              </p>
              <div className="text-sm">
                <p className="font-medium">{detail.customer.name} · <a className="underline" href={`tel:${detail.customer.phone}`}>{detail.customer.phone}</a></p>
                <p className="capitalize text-muted-foreground">{detail.fulfilment}{detail.customer.address ? ` · ${detail.customer.address}` : ""}{detail.customer.postcode ? ` (${detail.customer.postcode})` : ""}</p>
                {detail.when === "scheduled" && detail.scheduledTime && <p className="mt-1 font-semibold">For {detail.scheduledTime}</p>}
                {detail.customer.notes && <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" /> Customer note: {detail.customer.notes}</p>}
                {detail.handoverCode && <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">Handover code <span className="font-mono text-lg font-bold tracking-widest">{detail.handoverCode}</span> <span className="text-muted-foreground">- the customer should say this before you hand it over</span></p>}
                {detail.cancelReason && <p className="mt-1 text-sambal">Cancelled{detail.cancelKind === "customer" ? " by the customer" : detail.cancelKind === "no-show" ? " (not collected)" : ""}: {detail.cancelReason}</p>}
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
                  <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>{detail.paymentMethod === "wechat" ? `Total (WeChat · ${detail.paymentStatus === "paid" ? "PAID" : "awaiting payment"})` : detail.balancePaid ? "Total" : "Total (cash)"}</dt><dd className="font-display text-lg">{gbp(detail.total)}</dd></div>
                  {!!detail.balancePaid && (
                    <>
                      <div className="flex justify-between text-jade"><dt>Paid from prepaid balance</dt><dd>− {gbp(detail.balancePaid)}</dd></div>
                      <div className="flex justify-between font-semibold"><dt>{detail.total - detail.balancePaid <= 0.004 ? "Nothing to collect" : "Cash to collect"}</dt><dd>{gbp(Math.max(0, detail.total - detail.balancePaid))}</dd></div>
                    </>
                  )}
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

const CHOICE_LABEL: Record<PrintChoice, string> = { auto: "Automatic (recommended)", usb: "USB cable", serial: "Bluetooth", system: "Computer's printer" };

/** The kitchen printer for this device: found automatically, with plain-English help if it isn't printing. */
function TabletPrinterBar({ station }: { station: NonNullable<ReturnType<typeof usePrintStation>> }) {
  const { printer, platform, modes, choice, setChoice, connectDirect, autoPrint, toggleAutoPrint, receipt, toggleReceipt, testPrint } = station;
  const [help, setHelp] = useState(false);
  const connected = printer.state === "connected";
  const system = printer.mode === "system";
  // What to do when nothing is connected yet, in plain words.
  const todo = printer.mode === "usb"
    ? "Plug the printer into this tablet with its USB cable, then tap Connect printer and choose it. You only do this once."
    : "Switch the printer on, then tap Connect printer and choose it from the list. You only do this once.";
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm", connected ? "border-jade/40 bg-jade/5" : "border-gold/50 bg-gold/10")}>
      <div className="flex flex-wrap items-center gap-2">
        <Printer className={cn("size-4 shrink-0", connected ? "text-jade" : "text-gold-ink")} />
        <span className="mr-auto min-w-0">
          {connected
            ? <><span className="font-medium">Kitchen printer: {printer.name}</span>{printer.auto ? " (found automatically)" : ""}{autoPrint ? ". New orders print by themselves." : ". Automatic printing is off."}</>
            : printer.error ? <><span className="font-medium">The printer isn&apos;t connected</span> ({printer.error}). {todo}</>
            : <><span className="font-medium">Kitchen printer not connected yet.</span> {todo}</>}
        </span>
        {connected ? (
          <>
            <button onClick={toggleAutoPrint} role="switch" aria-checked={autoPrint} aria-label="Print new orders automatically on this device" className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition", autoPrint ? "bg-jade" : "bg-muted")}>
              <span className={cn("inline-block size-4 rounded-full bg-white shadow transition", autoPrint ? "translate-x-6" : "translate-x-1")} />
            </button>
            <label className="flex items-center gap-1.5 text-xs" title="Print the customer's copy after each kitchen ticket">
              <input type="checkbox" className="size-4" checked={receipt} onChange={toggleReceipt} /> Customer receipt
            </label>
            <Button size="sm" variant="outline" className="h-8" onClick={() => void testPrint()}>Test print</Button>
          </>
        ) : printer.state !== "unsupported" && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => void printer.connect()}><Printer className="size-4" /> Connect printer</Button>
        )}
        <button className="text-xs underline" onClick={() => setHelp((v) => !v)}>{help ? "Close help" : "Not printing?"}</button>
      </div>

      {help && (
        <div className="flex flex-col gap-3 rounded-lg bg-background p-3 text-xs text-muted-foreground">
          {system ? (
            <ol className="list-decimal space-y-1 pl-4">
              <li>Check the printer is switched on, has paper and the lid is closed.</li>
              {platform === "windows" && <li>In Windows: <b>Settings → Bluetooth &amp; devices → Printers &amp; scanners</b>. The receipt printer must be listed there. Click it → <b>Set as default</b>, then <b>Print test page</b>. If that page doesn&apos;t print, Windows can&apos;t reach the printer yet: install the printer&apos;s driver from the maker&apos;s website first.</li>}
              {platform === "mac" && <li>On the Mac: <b>System Settings → Printers &amp; Scanners</b>. The receipt printer must be listed and set as the default.</li>}
              <li>Each ticket opens a print window: press <b>Print</b>. (To print with no window at all, ask whoever set up this computer to add <code className="rounded bg-muted px-1">--kiosk-printing</code> to the Chrome shortcut: a one-time step.)</li>
              <li>Press <b>Test print</b> above to check.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-1 pl-4">
              <li>Check the printer is switched on, has paper and the lid is closed.</li>
              <li>{printer.mode === "usb" ? "Unplug the USB cable and plug it back in: it reconnects by itself." : "Switch the printer off and on again, and keep it near this device: it reconnects by itself."}</li>
              <li>If it still isn&apos;t connected, tap <b>Connect printer</b> and choose it again.</li>
            </ol>
          )}
          {system && connectDirect && (
            <div className="flex flex-wrap items-center gap-2">
              <span>Printer connected by Bluetooth or cable but not set up in the computer?</span>
              <Button size="sm" variant="outline" className="h-8" onClick={() => void connectDirect()}>Connect the printer directly</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span>Connection:</span>
            {(["auto", ...modes] as PrintChoice[]).map((c) => (
              <button key={c} onClick={() => setChoice(c)} aria-pressed={choice === c}
                className={cn("rounded-full border px-2.5 py-1 font-medium transition", choice === c ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
                {CHOICE_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
