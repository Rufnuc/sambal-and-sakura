"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote, Bike, ShoppingBag, Clock, CheckCircle2, MapPin, Tag, Minus, Plus, Trash2, AlertCircle, PartyPopper, Star, Navigation,
} from "lucide-react";
import { TravelEstimate } from "@/components/order/travel-estimate";
import { WeChatPay } from "@/components/order/wechat-pay";
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
import {
  findZone, isValidPostcode, deliveryFee, lookupVoucher, voucherDiscount, meetsMinimum,
  type Voucher,
} from "@/lib/order";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useAuth, LOYALTY } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

const TIME_SLOTS = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];

export interface ApiOrder {
  id: string;
  fulfilment: "delivery" | "collection";
  status: string;
  total: number;
  etaMins: number;
  pointsEarned: number;
  customerName: string;
  customerPhone: string;
  userId: string | null;
}

export type PayMethod = "cash" | "wechat";

export default function OrderPage() {
  const hydrated = useHydrated();
  const { business: b } = useSiteContent();
  const [placed, setPlaced] = useState<ApiOrder | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");

  if (placed) return <Confirmation order={placed} method={method} />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Checkout</h1>
      <p className="mt-2 flex items-center gap-2 text-muted-foreground">
        <Banknote className="size-4 text-jade" /> Cash only - pay on delivery or collection. No card needed.
      </p>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4 text-sambal" /> Food allergy or intolerance? Please phone us on <a href={telHref(b.phone)} className="font-medium text-foreground underline">{b.phone}</a> to confirm before ordering.
      </p>
      {hydrated ? <Checkout onPlaced={(o, m) => { setMethod(m); setPlaced(o); }} /> : <div className="mt-10 h-64 animate-pulse rounded-2xl bg-muted" />}
    </div>
  );
}

function Checkout({ onPlaced }: { onPlaced: (o: ApiOrder, method: PayMethod) => void }) {
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
  const subtotal = cartSubtotal(lines);

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
  const [when, setWhen] = useState<"asap" | string>("asap");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [areaHint, setAreaHint] = useState("");

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

  const zone = useMemo(() => (postcode && isValidPostcode(postcode) ? findZone(postcode) : null), [postcode]);
  const postcodeTouched = postcode.length >= 2;
  const postcodeValid = isValidPostcode(postcode);
  const inArea = fulfilment === "collection" || !!zone;

  const fee = deliveryFee(zone, subtotal, fulfilment);
  const discount = voucherDiscount(subtotal, voucher);
  const total = Math.max(0, subtotal + fee - discount);
  const minOk = meetsMinimum(subtotal, fulfilment);

  const canPlace =
    lines.length > 0 && name.trim().length > 1 && phone.trim().length >= 7 && minOk && inArea &&
    (fulfilment === "collection" || (postcodeValid && address.trim().length > 3));

  function applyVoucher() {
    const v = lookupVoucher(voucherCode);
    if (!v) { toast.error("That code isn't valid."); return; }
    if (v.minSpend && subtotal < v.minSpend) { toast.error(`Spend ${gbp(v.minSpend)} to use ${v.code}.`); return; }
    setVoucher(v);
    toast.success(`${v.label} applied`);
  }

  async function placeOrder() {
    if (!canPlace || submitting) return;
    setSubmitting(true);
    const payload = {
      lines: lines.map((l) => ({ itemId: l.itemId, optionIds: l.modifiers.map((m) => m.optionId), qty: l.qty })),
      fulfilment,
      postcode: fulfilment === "delivery" ? postcode : undefined,
      address: fulfilment === "delivery" ? address.trim() : undefined,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
      whenType: when === "asap" ? "asap" : "scheduled",
      scheduledTime: when === "asap" ? undefined : when,
      voucherCode: voucher?.code,
      payMethod: effectiveMethod,
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Could not place order."); setSubmitting(false); return; }
      track("order_placed", { id: data.order.id, total: data.order.total, fulfilment, items: lines.length });
      if (voucher) track("voucher_redeemed", { code: voucher.code });
      if (user) await refresh(); // pull updated points
      clear();
      onPlaced(data.order as ApiOrder, effectiveMethod);
    } catch {
      toast.error("Network error - please try again.");
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

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      {/* LEFT: details */}
      <div className="flex min-w-0 flex-col gap-6">
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
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-sambal"><AlertCircle className="size-4" /> Enter a valid UK postcode.</p>
                )}
                {postcodeValid && zone && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-jade"><CheckCircle2 className="size-4" /> {zone.label} · {gbp(zone.fee)} delivery · ~{zone.etaMins} min</p>
                )}
                {postcodeValid && !zone && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-sambal"><AlertCircle className="size-4" /> Sorry, we don't deliver there yet. Try collection?</p>
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
            <ToggleCard active={when === "asap"} onClick={() => setWhen("asap")} icon={Clock} label="ASAP" sub={`~${ORDERING.prepTimeMins} min`} />
            <ToggleCard active={when !== "asap"} onClick={() => setWhen(TIME_SLOTS[0])} icon={Clock} label="Schedule" sub="Pick a time" />
          </div>
          {when !== "asap" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {TIME_SLOTS.map((t) => (
                <button key={t} onClick={() => setWhen(t)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition", when === t ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
                  {t}
                </button>
              ))}
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
            <Label htmlFor="email">Email {user ? "" : "(optional - for your receipt)"}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" inputMode="email" autoComplete="email" placeholder="you@email.com" />
          </div>
          <div className="mt-3">
            <Label htmlFor="notes">Notes for the kitchen (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, spice preference, buzzer code…" className="mt-1.5 min-h-16" />
          </div>
          {!user && (
            <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">
              <Star className="mr-1 inline size-3.5 text-gold" /> Create an account at checkout to earn {LOYALTY.pointsPerPound} points per £1 and save rewards.
            </p>
          )}
        </Card>
      </div>

      {/* RIGHT: summary */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold">Order summary</h2>
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
          </ul>

          <Separator className="my-4" />

          <div className="flex gap-2">
            <Input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="Voucher code" className="h-10 uppercase" aria-label="Voucher code" />
            <Button variant="outline" className="h-10" onClick={applyVoucher}>Apply</Button>
          </div>
          {voucher && (
            <div className="mt-2 flex items-center gap-2 text-sm text-jade"><Tag className="size-4" /> {voucher.label} ({voucher.code})</div>
          )}

          <Separator className="my-4" />

          <dl className="flex flex-col gap-1.5 text-sm">
            <Row label="Subtotal" value={gbp(subtotal)} />
            {fulfilment === "delivery" && <Row label="Delivery" value={fee === 0 ? "Free" : gbp(fee)} />}
            {discount > 0 && <Row label="Discount" value={`− ${gbp(discount)}`} accent />}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold">Total (cash)</span>
              <span className="font-display text-2xl font-bold">{gbp(total)}</span>
            </div>
          </dl>

          {!minOk && fulfilment === "delivery" && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-sambal/10 px-3 py-2 text-xs text-sambal"><AlertCircle className="size-4" /> Minimum delivery order is {gbp(ORDERING.minOrder)}. Add {gbp(ORDERING.minOrder - subtotal)} more.</p>
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

          <Button className="mt-4 h-13 w-full text-base font-semibold" disabled={!canPlace || submitting} onClick={placeOrder}>
            {submitting ? "Placing…" : `Place order · ${gbp(total)}`}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Guest checkout · no account needed</p>
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

function ToggleCard({ active, onClick, icon: Icon, label, sub }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; sub: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted")}>
      <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
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
function Confirmation({ order, method }: { order: ApiOrder; method: PayMethod }) {
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
        Thanks {order.customerName.split(" ")[0]} - your order <span className="font-semibold text-foreground">{order.id}</span> is in.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="border-jade/30 bg-jade/10 text-jade">
            {order.fulfilment === "delivery" ? "Delivery" : "Collection"} · ~{order.etaMins} min
          </Badge>
          <span className="font-display text-xl font-bold">{gbp(order.total)}</span>
        </div>

        {method === "wechat" && (
          <div className="mt-6">
            <WeChatPay orderId={order.id} total={order.total} />
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
          <Banknote className="mr-1.5 inline size-4" /> {method === "cash" ? `Have ${gbp(order.total)} in cash ready.` : "Your order is being prepared."} Prep is usually {ORDERING.prepTimeMin}-{ORDERING.prepTimeMax} min - we'll notify {order.customerPhone} the moment it's ready.
        </div>
        {order.userId && order.pointsEarned > 0 && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-sm text-foreground">
            <Star className="size-4 text-gold" /> +{order.pointsEarned} points added to your account.
          </div>
        )}
        {order.fulfilment === "collection" && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" /> Collect from {b.address.line1}, {b.address.city} {b.address.postcode}.</p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="h-12 px-6"><Link href="/wheel">Spin the Fortune Wheel</Link></Button>
        <Button asChild variant="outline" className="h-12 px-6"><Link href="/menu">Order more</Link></Button>
      </div>
    </div>
  );
}
