"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote, Bike, ShoppingBag, Clock, CheckCircle2, MapPin, Tag, Minus, Plus, Trash2, AlertCircle, PartyPopper, Star, Navigation, PauseCircle, Gift,
} from "lucide-react";
import { TravelEstimate } from "@/components/order/travel-estimate";
import { WeChatPay } from "@/components/order/wechat-pay";
import { Turnstile } from "@/components/turnstile";
import { useLocale } from "@/lib/i18n/context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DishImage } from "@/components/brand/dish-image";
import { useCart, cartSubtotal } from "@/lib/store/cart";
import { useHydrated } from "@/lib/use-hydrated";
import { MENU } from "@/lib/data/menu";
import { ORDERING, ORDER_STATUS_FLOW } from "@/lib/data/site";
import { useSiteContent } from "@/components/site-content-provider";
import { telHref } from "@/lib/site-content";
import { isValidPostcode } from "@/lib/order";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useAuth, LOYALTY } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

export interface ApiOrder {
  id: string;
  fulfilment: "delivery" | "collection";
  status: string;
  total: number;
  etaMins: number;
  pointsEarned: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  userId: string | null;
  whenType?: string;
  scheduledTime?: string | null;
}

export type PayMethod = "cash" | "wechat";

// The server's price for the basket (POST /api/orders/quote) - the only numbers we show.
interface Quote {
  lines: { itemId: string; name: string; unitPrice: number; qty: number; free?: boolean }[];
  issues: { itemId: string; name: string; problem: "unavailable" | "invalid-options" }[];
  subtotal: number; deliveryFee: number; discount: number; total: number;
  zone: { label: string; fee: number; etaMins: number } | null;
  minMet: boolean; inArea: boolean; minOrder: number; freeDeliveryThreshold: number;
  voucher: { code: string; label: string; minSpend: number; applied: boolean } | null;
  voucherError: string | null;
  timing: { paused: boolean; asap: { ok: boolean; reason?: string }; leadHours: number; days: { date: string; label: string; times: string[] }[] };
}

type When = { kind: "asap" } | { kind: "scheduled"; date: string; time: string };

export default function OrderPage() {
  const hydrated = useHydrated();
  const { business: b } = useSiteContent();
  const [placed, setPlaced] = useState<{ order: ApiOrder; method: PayMethod; payToken: string | null; trackPath: string | null } | null>(null);

  if (placed) return <Confirmation order={placed.order} method={placed.method} payToken={placed.payToken} trackPath={placed.trackPath} />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Checkout</h1>
      <p className="mt-2 flex items-center gap-2 text-muted-foreground">
        <Banknote className="size-4 text-jade" /> Cash only - pay on delivery or collection. No card needed.
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4 text-sambal" /> Food allergy or intolerance? Please phone us on <a href={telHref(b.phone)} className="font-medium text-foreground underline">{b.phone}</a> to confirm before ordering.
      </p>
      {hydrated ? <Checkout onPlaced={(order, method, payToken, trackPath) => setPlaced({ order, method, payToken, trackPath })} /> : <div className="mt-10 h-64 animate-pulse rounded-2xl bg-muted" />}
    </div>
  );
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function Checkout({ onPlaced }: { onPlaced: (o: ApiOrder, method: PayMethod, payToken: string | null, trackPath: string | null) => void }) {
  const { lines, fulfilment, setFulfilment, postcode, setPostcode, setQty, removeLine, clear } = useCart();
  const { user, refresh } = useAuth();
  const { locale } = useLocale();
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [wechatOk, setWechatOk] = useState(false);
  useEffect(() => {
    fetch("/api/pay/methods").then((r) => r.json()).then((d) => setWechatOk(!!d.wechat)).catch(() => setWechatOk(false));
  }, []);
  // If WeChat stops being offered (e.g. language switched away from Chinese), fall back to cash.
  const wechatShown = locale === "zh" && wechatOk;
  const effectiveMethod: PayMethod = wechatShown ? payMethod : "cash";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // Prefill from the signed-in account (once, when it loads).
  useEffect(() => {
    if (user) {
      setName((n) => n || user.name);
      setPhone((p) => p || user.phone);
      setEmail((e) => e || user.email);
    }
  }, [user]);
  const [notes, setNotes] = useState("");
  const [chosenWhen, setWhen] = useState<When>({ kind: "asap" });
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [areaHint, setAreaHint] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [humanToken, setHumanToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  // One checkout attempt = one order: retries after a network blip return the same order.
  const idempotencyKey = useRef(newKey());

  const postcodeTouched = postcode.length >= 2;
  const postcodeValid = isValidPostcode(postcode);
  const localSubtotal = cartSubtotal(lines);

  // Ask the server for the real price whenever the basket or delivery details change.
  const quoteBody = useMemo(() => JSON.stringify({
    lines: lines.map((l) => ({ itemId: l.itemId, optionIds: l.modifiers.map((m) => m.optionId), qty: l.qty })),
    fulfilment,
    postcode: fulfilment === "delivery" && postcodeValid ? postcode : undefined,
    voucherCode: appliedCode || undefined,
    phone: appliedCode && phone.trim().length >= 7 ? phone.trim() : undefined,
  }), [lines, fulfilment, postcode, postcodeValid, appliedCode, phone]);

  useEffect(() => {
    if (lines.length === 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/orders/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: quoteBody, signal: ctrl.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setQuote(d.quote);
        setSiteKey(d.turnstileSiteKey ?? null);
        setQuoteFailed(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setQuoteFailed(true);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [quoteBody, lines.length]);

  // The customer's choice, kept valid as availability changes (e.g. a pre-order dish was added,
  // or it's now too late for ASAP): falls back to the nearest available time.
  const when = useMemo<When>(() => {
    const w = chosenWhen;
    if (!quote) return w;
    const { asap, days } = quote.timing;
    if (w.kind === "asap") return asap.ok || !days.length ? w : { kind: "scheduled", date: days[0].date, time: days[0].times[0] };
    const day = days.find((d) => d.date === w.date);
    if (day?.times.includes(w.time)) return w;
    return day ? { ...w, time: day.times[0] } : days.length ? { kind: "scheduled", date: days[0].date, time: days[0].times[0] } : { kind: "asap" };
  }, [chosenWhen, quote]);

  // Tell the customer when an applied code doesn't work (once per message).
  const lastVoucherError = useRef<string | null>(null);
  useEffect(() => {
    const err = quote?.voucherError ?? null;
    if (err && err !== lastVoucherError.current && appliedCode) toast.error(err);
    lastVoucherError.current = err;
  }, [quote?.voucherError, appliedCode]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) { toast.error("Location isn't available on this device."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/geo/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const d = await r.json();
          if (d.ok) { setPostcode(d.postcode); setAreaHint(d.area || ""); toast.success(`Found you near ${d.postcode}`); }
          else toast.error("Couldn't find your postcode - enter it manually.");
        } catch { toast.error("Location lookup failed."); }
        finally { setLocating(false); }
      },
      () => { setLocating(false); toast.error("We couldn't get your location."); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const q = quote;
  const timing = q?.timing;
  const paused = !!timing?.paused;
  const unavailable = q?.issues ?? [];
  const deliveryAreaOk = fulfilment === "collection" || (postcodeValid && !!q?.inArea);
  const whenOk = when.kind === "asap" ? !!timing?.asap.ok : !!timing?.days.find((d) => d.date === when.date)?.times.includes(when.time);
  const needsHuman = !user && !!siteKey;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canPlace =
    !!q && !paused && unavailable.length === 0 && q.minMet && deliveryAreaOk && whenOk &&
    name.trim().length > 1 && phone.trim().length >= 7 && emailValid &&
    (fulfilment === "collection" || address.trim().length > 3) &&
    (!needsHuman || !!humanToken);
  const total = q?.total ?? localSubtotal;

  function removeUnavailable() {
    const bad = new Set(unavailable.map((i) => i.itemId));
    for (const l of lines) if (bad.has(l.itemId)) removeLine(l.lineId);
    toast.success("Updated your basket");
  }

  async function placeOrder() {
    if (!canPlace || submitting || !q) return;
    setSubmitting(true);
    track("begin_checkout", { items: lines.length });
    const payload = {
      lines: lines.map((l) => ({ itemId: l.itemId, optionIds: l.modifiers.map((m) => m.optionId), qty: l.qty })),
      fulfilment,
      postcode: fulfilment === "delivery" ? postcode : undefined,
      address: fulfilment === "delivery" ? address.trim() : undefined,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      notes: notes.trim() || undefined,
      whenType: when.kind,
      scheduledFor: when.kind === "scheduled" ? `${when.date} ${when.time}` : undefined,
      voucherCode: q.voucher?.code,
      payMethod: effectiveMethod,
      expectedTotal: q.total,
      idempotencyKey: idempotencyKey.current,
      locale, // emails come in the language they're using
      turnstileToken: humanToken || undefined,
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.quote) setQuote(data.quote); // prices / availability changed: show the new numbers
        toast.error(data.error ?? "Could not place order.");
        if (needsHuman) { setHumanToken(""); setTurnstileReset((n) => n + 1); }
        setSubmitting(false);
        return;
      }
      track("order_placed", { total: data.order.total, fulfilment, items: lines.length });
      if (q.voucher?.applied) track("voucher_redeemed", { code: q.voucher.code });
      if (user) await refresh(); // pull updated points
      clear();
      onPlaced(data.order as ApiOrder, effectiveMethod, data.payToken ?? null, data.trackPath ?? null);
    } catch {
      toast.error("Network error - please try again. You won't be charged twice.");
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
        <ShoppingBag className="size-10 text-muted-foreground" />
        <p className="text-lg font-medium">Your basket is empty.</p>
        <Button asChild className="h-12 px-6"><Link href="/menu">Browse the menu</Link></Button>
      </div>
    );
  }

  const selectedDay = when.kind === "scheduled" ? timing?.days.find((d) => d.date === when.date) : undefined;
  const freeLines = (q?.lines ?? []).filter((l) => l.free);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      {/* LEFT: details */}
      <div className="flex min-w-0 flex-col gap-6">
        {paused && (
          <div className="flex items-start gap-3 rounded-2xl border border-sambal/30 bg-sambal/10 p-4 text-sm">
            <PauseCircle className="mt-0.5 size-5 shrink-0 text-sambal" />
            <p>{timing?.asap.reason ?? "We're not taking online orders right now."}</p>
          </div>
        )}

        {/* Fulfilment */}
        <Card title="How would you like it?">
          <div className="grid grid-cols-2 gap-3">
            <ToggleCard active={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")} icon={Bike} label="Delivery" sub={`From ${gbp(ORDERING.deliveryZones[0].fee)} · free over ${gbp(ORDERING.freeDeliveryThreshold)}`} />
            <ToggleCard active={fulfilment === "collection"} onClick={() => setFulfilment("collection")} icon={ShoppingBag} label="Collection" sub={`Ready in ${ORDERING.prepTimeMin}-${ORDERING.prepTimeMax} min`} />
          </div>

          {fulfilment === "delivery" && (
            <div className="mt-4 grid gap-3">
              <div>
                <Label htmlFor="postcode">Delivery postcode</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. TS1 3QP" className="h-11 uppercase" autoComplete="postal-code" inputMode="text" />
                  <Button type="button" variant="outline" className="h-11 shrink-0 gap-1.5" onClick={useMyLocation} disabled={locating}>
                    <Navigation className="size-4" /> {locating ? "Locating…" : "Use my location"}
                  </Button>
                </div>
                {areaHint && <p className="mt-1.5 text-xs text-muted-foreground">Detected area: {areaHint}</p>}
                {postcodeTouched && !postcodeValid && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-sambal"><AlertCircle className="size-4" /> Enter your full UK postcode, e.g. TS1 3QP.</p>
                )}
                {postcodeValid && q?.zone && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-jade"><CheckCircle2 className="size-4" /> {q.zone.label} · {gbp(q.zone.fee)} delivery · ~{q.zone.etaMins} min</p>
                )}
                {postcodeValid && q && !q.inArea && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-sambal"><AlertCircle className="size-4" /> Sorry, we don&apos;t deliver there yet. Try collection?</p>
                )}
              </div>
              <div>
                <Label htmlFor="address">Delivery address</Label>
                <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat / house, street" className="mt-1.5 min-h-20" />
              </div>
            </div>
          )}
          <div className="mt-4">
            <TravelEstimate fulfilment={fulfilment} />
          </div>
        </Card>

        {/* When */}
        <Card title="When?">
          <div className="grid grid-cols-2 gap-3">
            <ToggleCard active={when.kind === "asap"} disabled={!timing?.asap.ok} onClick={() => setWhen({ kind: "asap" })} icon={Clock} label="ASAP" sub={timing?.asap.ok ? `~${ORDERING.prepTimeMins} min` : "Not available now"} />
            <ToggleCard active={when.kind === "scheduled"} disabled={!timing?.days.length} onClick={() => timing?.days[0] && setWhen({ kind: "scheduled", date: timing.days[0].date, time: timing.days[0].times[0] })} icon={Clock} label="Schedule" sub="Pick a day and time" />
          </div>
          {timing && !timing.asap.ok && timing.asap.reason && !paused && (
            <p className="mt-3 text-sm text-muted-foreground">{timing.asap.reason}</p>
          )}
          {when.kind === "scheduled" && timing && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {timing.days.map((d) => (
                  <button key={d.date} type="button" onClick={() => setWhen({ kind: "scheduled", date: d.date, time: d.times[0] })} aria-pressed={when.date === d.date}
                    className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition", when.date === d.date ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                {selectedDay?.times.map((t) => (
                  <button key={t} type="button" onClick={() => setWhen({ kind: "scheduled", date: selectedDay.date, time: t })} aria-pressed={when.time === t}
                    className={cn("rounded-full border px-3 py-1 text-sm tabular-nums transition", when.time === t ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted")}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Your details */}
        <Card title="Your details">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-11" inputMode="tel" autoComplete="tel" placeholder="07…" />
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" inputMode="email" autoComplete="email" placeholder="you@email.com" required />
            <p className="mt-1 text-xs text-muted-foreground">We email your order confirmation and updates (on its way, ready, cancelled).</p>
            {email.trim().length > 3 && !emailValid && <p className="mt-1 text-xs text-sambal">Enter a valid email address.</p>}
          </div>
          <div className="mt-3">
            <Label htmlFor="notes">Notes for the kitchen (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Spice preference, buzzer code… (for allergies, please phone us)" className="mt-1.5 min-h-16" />
          </div>
          {!user && (
            <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">
              <Star className="mr-1 inline size-3.5 text-gold-ink" /> Create an account to earn {LOYALTY.pointsPerPound} points per £1 on completed orders and save rewards.
            </p>
          )}
        </Card>
      </div>

      {/* RIGHT: summary */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold">Order summary</h2>

          {unavailable.length > 0 && (
            <div className="mt-3 rounded-lg border border-sambal/30 bg-sambal/10 p-3 text-sm">
              <p className="font-medium text-sambal">Some items changed:</p>
              <ul className="mt-1 list-disc pl-5 text-foreground">
                {unavailable.map((i) => <li key={i.itemId}>{i.name} - {i.problem === "unavailable" ? "no longer available" : "please choose its options again"}</li>)}
              </ul>
              <Button size="sm" variant="outline" className="mt-2 h-8" onClick={removeUnavailable}>Remove them</Button>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-3">
            {lines.map((l) => (
              <li key={l.lineId} className="flex gap-3">
                <DishImage name={l.name} category={MENU.find((m) => m.id === l.itemId)?.category ?? "mains"} className="size-14 shrink-0" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <span className="shrink-0 text-sm font-semibold">{gbp(l.unitPrice * l.qty)}</span>
                  </div>
                  {l.modifiers.length > 0 && <p className="truncate text-xs text-muted-foreground">{l.modifiers.map((m) => m.label).join(" · ")}</p>}
                  <div className="mt-1 inline-flex items-center rounded-full border border-border">
                    <button aria-label="Decrease" className="flex size-7 items-center justify-center hover:bg-muted" onClick={() => setQty(l.lineId, l.qty - 1)}><Minus className="size-3" /></button>
                    <span className="w-6 text-center text-xs tabular-nums">{l.qty}</span>
                    <button aria-label="Increase" className="flex size-7 items-center justify-center hover:bg-muted" onClick={() => setQty(l.lineId, l.qty + 1)}><Plus className="size-3" /></button>
                    <button aria-label="Remove" className="ml-1 flex size-7 items-center justify-center text-muted-foreground hover:text-sambal" onClick={() => removeLine(l.lineId)}><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </li>
            ))}
            {freeLines.map((l) => (
              <li key={`free-${l.itemId}`} className="flex items-center gap-2 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
                <Gift className="size-4" /> <span className="flex-1">{l.name}</span> <span className="font-semibold">Free</span>
              </li>
            ))}
          </ul>

          <Separator className="my-4" />

          <div className="flex gap-2">
            <Input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Voucher code" className="h-10 uppercase" aria-label="Voucher code" />
            <Button variant="outline" className="h-10" onClick={() => setAppliedCode(codeInput.trim().toUpperCase())}>Apply</Button>
          </div>
          {q?.voucher && (
            <div className="mt-2 flex items-center gap-2 text-sm text-jade">
              <Tag className="size-4" /> {q.voucher.label} ({q.voucher.code})
              {!q.voucher.applied && q.voucher.minSpend > 0 && <span className="text-muted-foreground"> - spend {gbp(q.voucher.minSpend)} to use it</span>}
            </div>
          )}
          {q?.voucherError && appliedCode && <p className="mt-2 text-sm text-sambal">{q.voucherError}</p>}

          <Separator className="my-4" />

          <dl className="flex flex-col gap-1.5 text-sm">
            <Row label="Subtotal" value={gbp(q?.subtotal ?? localSubtotal)} />
            {fulfilment === "delivery" && <Row label="Delivery" value={!q || !postcodeValid ? "Enter postcode" : q.deliveryFee === 0 ? "Free" : gbp(q.deliveryFee)} />}
            {!!q?.discount && <Row label="Discount" value={`− ${gbp(q.discount)}`} accent />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold">Total (cash)</span>
              <span className="font-display text-2xl font-bold">{gbp(total)}</span>
            </div>
          </dl>
          {quoteFailed && <p className="mt-2 text-xs text-sambal">Couldn&apos;t refresh prices - check your connection.</p>}

          {q && !q.minMet && fulfilment === "delivery" && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-sambal/10 px-3 py-2 text-xs text-sambal"><AlertCircle className="size-4" /> Minimum delivery order is {gbp(q.minOrder)} of food. Add {gbp(Math.max(0, q.minOrder - q.subtotal))} more.</p>
          )}

          {/* Payment method — WeChat Pay is offered automatically to Chinese-language guests. */}
          {wechatShown && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Payment method</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPayMethod("cash")} aria-pressed={payMethod === "cash"}
                  className={cn("rounded-xl border p-3 text-left text-sm transition", payMethod === "cash" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted")}>
                  <Banknote className="mb-1 size-4 text-jade" /><span className="block font-medium">Cash on delivery / collection</span>
                </button>
                <button type="button" onClick={() => setPayMethod("wechat")} aria-pressed={payMethod === "wechat"}
                  className={cn("rounded-xl border p-3 text-left text-sm transition", payMethod === "wechat" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted")}>
                  <span className="mb-1 block text-xs font-bold text-jade notranslate" translate="no">微信 WeChat</span><span className="block font-medium">WeChat Pay</span>
                </button>
              </div>
              {payMethod === "wechat" && <p className="mt-2 text-xs text-muted-foreground">Pay securely with WeChat - available for our Chinese-speaking guests.</p>}
            </div>
          )}

          {effectiveMethod === "cash" && (
            <div className="mt-4 rounded-lg bg-jade/10 px-3 py-2 text-xs text-jade">
              <Banknote className="mr-1.5 inline size-4" /> Please have {gbp(total)} in cash ready for {fulfilment}.
            </div>
          )}

          {needsHuman && <Turnstile siteKey={siteKey} onToken={setHumanToken} resetKey={turnstileReset} />}

          <Button className="mt-4 h-13 w-full text-base font-semibold" disabled={!canPlace || submitting} onClick={placeOrder}>
            {submitting ? "Placing…" : paused ? "Online ordering paused" : `Place order · ${gbp(total)}`}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Guest checkout · no account needed</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">By placing your order you agree to our <Link href="/legal/terms" className="underline hover:text-gold-ink">Terms</Link>. See how we use your details in our <Link href="/legal/privacy" className="underline hover:text-gold-ink">Privacy Policy</Link>.</p>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ToggleCard({ active, onClick, icon: Icon, label, sub, disabled }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; sub: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={cn("flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted")}>
      <Icon className={cn("size-5", active ? "text-gold-ink" : "text-muted-foreground")} />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(accent && "text-jade")}>{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------- Confirmation */
function Confirmation({ order, method, payToken, trackPath }: { order: ApiOrder; method: PayMethod; payToken: string | null; trackPath: string | null }) {
  const { business: b } = useSiteContent();
  const flow = ORDER_STATUS_FLOW.filter((s) =>
    order.fulfilment === "delivery" ? s.id !== "ready-for-collection" : s.id !== "out-for-delivery",
  );
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-jade/15 text-jade">
        <PartyPopper className="size-8" />
      </div>
      <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight">Order confirmed!</h1>
      <p className="mt-2 text-muted-foreground">
        Thanks <span className="notranslate" translate="no">{order.customerName.split(" ")[0]}</span> - your order <span className="font-semibold text-foreground notranslate" translate="no">{order.id}</span> is in.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-jade/30 bg-jade/10 text-jade">
            {order.fulfilment === "delivery" ? "Delivery" : "Collection"} · {order.whenType === "scheduled" && order.scheduledTime ? order.scheduledTime : `~${order.etaMins} min`}
          </Badge>
          <span className="font-display text-xl font-bold">{gbp(order.total)}</span>
        </div>

        {method === "wechat" && payToken && (
          <div className="mt-6">
            <WeChatPay orderId={order.id} total={order.total} payToken={payToken} />
          </div>
        )}

        {/* Status tracker */}
        <ol className="mt-6 space-y-4">
          {flow.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3">
              <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-jade text-white" : "bg-muted text-muted-foreground")}>
                {i === 0 ? <CheckCircle2 className="size-4" /> : i + 1}
              </span>
              <span className={cn(i === 0 ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
          <Banknote className="mr-1.5 inline size-4" /> {method === "cash" ? `Have ${gbp(order.total)} in cash ready.` : "Your order will be prepared once payment is confirmed."} Prep is usually {ORDERING.prepTimeMin}-{ORDERING.prepTimeMax} min.{order.customerEmail ? <> We&apos;ve emailed your confirmation to <span className="notranslate" translate="no">{order.customerEmail}</span> and will email you as your order progresses.</> : null} If there&apos;s a problem we&apos;ll phone <span className="notranslate" translate="no">{order.customerPhone}</span>.
        </div>
        {order.userId && order.pointsEarned > 0 && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-sm text-foreground">
            <Star className="size-4 text-gold-ink" /> +{order.pointsEarned} points pending - they&apos;re added to your balance when your order is completed.
          </div>
        )}
        {order.fulfilment === "collection" && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" /> Collect from {b.address.line1}, {b.address.city} {b.address.postcode}.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Questions about your order? Call <a className="underline" href={telHref(b.phone)}>{b.phone}</a> and quote <span className="notranslate" translate="no">{order.id}</span>.</p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {trackPath && <Button asChild className="h-12 px-6"><Link href={trackPath}>Track your order</Link></Button>}
        {order.userId && <Button asChild variant="outline" className="h-12 px-6"><Link href="/offers?tab=wheel">Spin the Fortune Wheel</Link></Button>}
        <Button asChild variant="outline" className="h-12 px-6"><Link href="/menu">Order more</Link></Button>
      </div>
    </div>
  );
}
