"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChefHat, Bike, ShoppingBag, PartyPopper, XCircle, Phone, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TrackData {
  order: {
    id: string; status: string; fulfilment: "delivery" | "collection"; whenType: string; scheduledTime: string | null;
    createdAt: string; etaMins: number; firstName: string;
    lines: { name: string; qty: number; unitPrice: number }[];
    subtotal: number; deliveryFee: number; discount: number; total: number;
    paymentMethod: string; paymentStatus: string; cancelKind: string | null; cancelReason: string | null;
  };
  cancel: { can: true; secondsLeft: number } | { can: false; reason: string };
  restaurant: { phone: string; address: string };
}

const REASONS = ["Changed my mind", "Ordered by mistake", "Taking too long", "Other"];
const POLL_MS = 20_000;

/** The customer's live order page (opened from the link in their "order received" email). */
export function TrackOrder({ id, token }: { id: string; token: string }) {
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(0); // seconds left to cancel online
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/track/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "We couldn't find this order."); return; }
      setData(d);
      setLeft(d.cancel.can ? d.cancel.secondsLeft : 0);
      setError("");
    } catch { /* keep the last view; try again on the next tick */ }
  }, [id, token]);

  const finished = data?.order.status === "completed" || data?.order.status === "cancelled";
  useEffect(() => {
    void load();
    if (finished) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, finished]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  async function cancelOrder() {
    setBusy(true);
    const r = await fetch(`/api/track/${encodeURIComponent(id)}/cancel?t=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(d.error ?? "Couldn't cancel."); void load(); return; }
    toast.success("Your order has been cancelled. We've told the kitchen.");
    setCancelling(false);
    void load();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <XCircle className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-muted-foreground">{error} Please use the link in your order email.</p>
      </div>
    );
  }
  if (!data) return <div className="mx-auto max-w-2xl px-4 py-16"><div className="h-80 animate-pulse rounded-2xl bg-muted" /></div>;

  const o = data.order;
  const delivery = o.fulfilment === "delivery";
  const steps = [
    { id: "received", label: "Order received", icon: CheckCircle2 },
    { id: "preparing", label: "Being cooked", icon: ChefHat },
    delivery ? { id: "out-for-delivery", label: "On the way", icon: Bike } : { id: "ready-for-collection", label: "Ready for pickup", icon: ShoppingBag },
    { id: "completed", label: delivery ? "Delivered" : "Collected", icon: PartyPopper },
  ];
  const current = steps.findIndex((s) => s.id === o.status);
  const cancelled = o.status === "cancelled";
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="font-medium uppercase tracking-widest text-gold-ink">Your order</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        <span className="notranslate" translate="no">{o.id}</span>
      </h1>
      <p className="mt-2 text-muted-foreground">
        {delivery ? "Delivery" : "Collection"} · {o.whenType === "scheduled" && o.scheduledTime ? `for ${o.scheduledTime}` : `ordered ${new Date(o.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
        {!finished && " · this page updates by itself"}
      </p>

      {cancelled ? (
        <div className="mt-8 rounded-2xl border border-sambal/30 bg-sambal/10 p-6">
          <p className="flex items-center gap-2 font-display text-xl font-bold text-sambal"><XCircle className="size-6" /> Order cancelled</p>
          <p className="mt-2 text-sm">
            {o.cancelKind === "customer" ? `You cancelled this order${o.cancelReason ? ` (${o.cancelReason})` : ""}.` : "This order was cancelled by the restaurant."}{" "}
            {o.paymentStatus === "paid" ? "You paid by WeChat Pay, so we'll refund you." : "You haven't been charged."}
          </p>
        </div>
      ) : (
        <ol className="mt-8 flex flex-col gap-1">
          {steps.map((s, i) => {
            const done = i < current, active = i === current;
            return (
              <li key={s.id} className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className={cn("flex size-11 items-center justify-center rounded-full border-2 transition", done ? "border-jade bg-jade text-white" : active ? "border-gold bg-gold/15 text-gold-ink" : "border-border text-muted-foreground")}>
                    <s.icon className={cn("size-5", active && "animate-pulse")} />
                  </span>
                  {i < steps.length - 1 && <span className={cn("h-6 w-0.5", done ? "bg-jade" : "bg-border")} />}
                </div>
                <div className="-mt-6 pb-1">
                  <p className={cn("font-semibold", !done && !active && "text-muted-foreground")}>{s.label}</p>
                  {active && s.id === "preparing" && <p className="text-xs text-muted-foreground">Usually {o.etaMins} minutes in total</p>}
                  {active && s.id === "ready-for-collection" && <p className="text-xs text-muted-foreground">Collect from {data.restaurant.address}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!cancelled && !finished && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {data.cancel.can && left > 0 ? (
            cancelling ? (
              <div>
                <p className="font-medium">Cancel this order? <span className="text-sm font-normal text-muted-foreground">({mm}:{ss} left)</span></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REASONS.map((r) => (
                    <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", reason === r ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>{r}</button>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="destructive" disabled={busy} onClick={cancelOrder}>{busy ? "Cancelling…" : "Yes, cancel my order"}</Button>
                  <Button variant="outline" onClick={() => setCancelling(false)}>Keep my order</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm"><Clock className="mr-1.5 inline size-4 align-[-3px] text-gold-ink" />Changed your mind? You can cancel for <b className="tabular-nums">{mm}:{ss}</b>.</p>
                <Button variant="outline" className="h-9 text-sambal hover:text-sambal" onClick={() => setCancelling(true)}>Cancel order</Button>
              </div>
            )
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="size-4" /> {data.cancel.can ? "It's too late to cancel online." : data.cancel.reason} {!data.cancel.can || left <= 0 ? <a className="font-medium text-foreground underline" href={`tel:${data.restaurant.phone.replace(/[^\d+]/g, "")}`}>{data.restaurant.phone}</a> : null}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <ul className="divide-y divide-border text-sm">
          {o.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-2"><span>{l.qty} × {l.name}</span><span>{l.unitPrice === 0 ? "Free" : gbp(l.unitPrice * l.qty)}</span></li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 text-sm">
          {o.deliveryFee > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{gbp(o.deliveryFee)}</dd></div>}
          {o.discount > 0 && <div className="flex justify-between text-jade"><dt>Discount</dt><dd>− {gbp(o.discount)}</dd></div>}
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <dt>{o.paymentMethod === "wechat" ? (o.paymentStatus === "paid" ? "Paid (WeChat Pay)" : "Total (WeChat Pay)") : "Total (pay cash)"}</dt>
            <dd className="font-display text-lg">{gbp(o.total)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Questions? Call <a className="underline" href={`tel:${data.restaurant.phone.replace(/[^\d+]/g, "")}`}>{data.restaurant.phone}</a> and quote <span className="notranslate" translate="no">{o.id}</span>. <Link href="/menu" className="underline">Order again</Link>
      </p>
    </div>
  );
}
