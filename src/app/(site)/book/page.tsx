"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Users, CalendarDays, Clock, CheckCircle2, Phone, ShieldCheck, Minus, Plus, PartyPopper, Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useHydrated } from "@/lib/use-hydrated";
import { needsDeposit, isPeak, type Slot } from "@/lib/booking";
import { BOOKING_POLICY, MAX_ONLINE_PARTY } from "@/lib/data/tables";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/store/auth";
import { useSiteContent } from "@/components/site-content-provider";
import { telHref } from "@/lib/site-content";
import { Turnstile } from "@/components/turnstile";
import { cn } from "@/lib/utils";

interface ApiBooking {
  id: string; name: string; phone: string; date: string; time: string;
  party: number; status: string; occasion?: string | null; requiresCall?: boolean;
}

const OCCASIONS = ["None", "Birthday", "Anniversary", "Date night", "Business", "Celebration"];

function nextDates(count: number): { value: string; label: string; sub: string }[] {
  const out = [];
  // Start from today's date in the UK (the restaurant's calendar), whatever this device's timezone.
  const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - 1, dd + i, 12);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" });
    const sub = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    out.push({ value, label, sub });
  }
  return out;
}

export default function BookPage() {
  const hydrated = useHydrated();
  const [confirmed, setConfirmed] = useState<ApiBooking | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold-ink">Reservations</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Book a table</h1>
        <p className="mt-3 flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="size-4 text-jade" /> We always keep tables free for walk-ins, so service stays relaxed.
        </p>
      </header>

      {confirmed ? (
        <BookingConfirmation booking={confirmed} />
      ) : hydrated ? (
        <BookingFlow onConfirmed={setConfirmed} />
      ) : (
        <div className="mt-10 h-96 animate-pulse rounded-2xl bg-muted" />
      )}
    </div>
  );
}

function BookingFlow({ onConfirmed }: { onConfirmed: (b: ApiBooking) => void }) {
  const dates = useMemo(() => nextDates(14), []);
  const [party, setParty] = useState(2);
  const [date, setDate] = useState(dates[0].value);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [occasion, setOccasion] = useState("None");
  const [dietary, setDietary] = useState("");
  const [notes, setNotes] = useState("");
  const { business: b } = useSiteContent();
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [humanToken, setHumanToken] = useState("");
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (user) { setName((n) => n || user.name); setPhone((p) => p || user.phone); }
  }, [user]);
  useEffect(() => {
    fetch("/api/public-config").then((r) => r.json()).then((d) => setSiteKey(d.turnstileSiteKey ?? null)).catch(() => {});
  }, []);
  const needsHuman = !user && !!siteKey;

  // Server-authoritative availability.
  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true); setTime(null);
    fetch(`/api/bookings/availability?date=${date}&party=${party}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSlots(d.slots ?? []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [date, party]);

  const tooBig = party > MAX_ONLINE_PARTY;
  const deposit = needsDeposit(party);
  const selectedSlot = slots.find((s) => s.time === time) ?? null;

  const canConfirm = !tooBig && !!time && name.trim().length > 1 && phone.trim().length >= 7 && !submitting && (!needsHuman || !!humanToken);

  async function confirm() {
    if (!canConfirm || !selectedSlot) return;
    setSubmitting(true);
    const payload = {
      name: name.trim(), phone: phone.trim(), date, time,
      party, occasion: occasion !== "None" ? occasion : undefined,
      dietary: dietary.trim() || undefined, notes: notes.trim() || undefined,
      turnstileToken: humanToken || undefined,
    };
    try {
      const res = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not create booking.");
        if (needsHuman) { setHumanToken(""); setResetKey((n) => n + 1); }
        // refresh availability in case the slot just filled
        fetch(`/api/bookings/availability?date=${date}&party=${party}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setSlots(d.slots ?? [])).catch(() => {});
        setSubmitting(false);
        return;
      }
      track("booking_confirmed", { id: data.booking.id, party, date, time, waitlist: data.booking.status === "waitlist" });
      onConfirmed(data.booking as ApiBooking);
    } catch {
      toast.error("Network error - please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Party */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><Users className="size-5 text-gold-ink" /> Party size</h2>
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center rounded-full border border-border">
              <button aria-label="Fewer guests" className="flex size-11 items-center justify-center rounded-full hover:bg-muted" onClick={() => { setParty((p) => Math.max(1, p - 1)); track("booking_started"); }}><Minus className="size-4" /></button>
              <span className="w-12 text-center font-display text-2xl font-bold tabular-nums">{party}</span>
              <button aria-label="More guests" className="flex size-11 items-center justify-center rounded-full hover:bg-muted" onClick={() => setParty((p) => Math.min(20, p + 1))}><Plus className="size-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">{party === 1 ? "guest" : "guests"}</p>
          </div>
          {tooBig && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-sm text-foreground">
              <Phone className="size-4 text-gold-ink" /> For parties over {MAX_ONLINE_PARTY}, please call us on <a className="font-medium underline" href={telHref(b.phone)}>{b.phone}</a>.
            </p>
          )}
          {deposit && !tooBig && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Info className="size-4" /> Parties of {BOOKING_POLICY.depositThresholdParty}+ need a {gbp(BOOKING_POLICY.depositPerHead)}/head deposit, taken when we confirm by phone.
            </p>
          )}
        </section>

        {/* Date */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><CalendarDays className="size-5 text-gold-ink" /> Date</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => { setDate(d.value); setTime(null); }}
                className={cn(
                  "flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition",
                  date === d.value ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                )}
              >
                <span className="text-sm font-semibold">{d.label}</span>
                <span className="text-xs opacity-80">{d.sub}</span>
                {isPeak(d.value) && <span className={cn("mt-0.5 text-[10px]", date === d.value ? "text-gold-soft" : "text-gold-ink")}>Peak</span>}
              </button>
            ))}
          </div>
        </section>

        {/* Time */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-bold"><Clock className="size-5 text-gold-ink" /> Time</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {isPeak(date) ? "Peak night - more tables held for walk-ins." : "Pick a slot below."}
          </p>
          {loadingSlots ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Closed on this date - try another day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <button
                  key={s.time}
                  disabled={s.state === "full"}
                  onClick={() => setTime(s.time)}
                  className={cn(
                    "rounded-lg border px-2 py-2.5 text-sm font-medium transition",
                    s.state === "full" && "cursor-not-allowed border-border/60 text-muted-foreground/40 line-through",
                    s.state === "waitlist" && "border-gold/40 bg-gold/5 text-foreground",
                    s.state === "available" && "border-border hover:border-primary hover:bg-primary/5",
                    time === s.time && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {s.time}
                  {s.state === "waitlist" && time !== s.time && <span className="block text-[10px] text-gold-ink">waitlist</span>}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-primary" /> Available</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-gold" /> Waitlist</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-muted-foreground/40" /> Full</span>
          </div>
        </section>

        {/* Details */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-display text-xl font-bold">Your details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="bname">Name</Label><Input id="bname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" autoComplete="name" /></div>
            <div><Label htmlFor="bphone">Phone</Label><Input id="bphone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-11" inputMode="tel" autoComplete="tel" placeholder="07…" /></div>
          </div>
          <div className="mt-3">
            <Label>Occasion</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {OCCASIONS.map((o) => (
                <button key={o} onClick={() => setOccasion(o)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", occasion === o ? "border-primary bg-primary/10 text-gold-ink" : "border-border hover:bg-muted")}>{o}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="diet">Dietary notes</Label><Input id="diet" value={dietary} onChange={(e) => setDietary(e.target.value)} className="mt-1.5 h-11" placeholder="Allergies, vegan…" /></div>
            <div><Label htmlFor="bnotes">Special requests</Label><Input id="bnotes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-11" placeholder="High chair, quiet table…" /></div>
          </div>
        </section>
      </div>

      {/* Summary */}
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold">Your reservation</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <SummaryRow label="Party" value={`${party} ${party === 1 ? "guest" : "guests"}`} />
            <SummaryRow label="Date" value={new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} />
            <SummaryRow label="Time" value={time ?? "-"} />
            {occasion !== "None" && <SummaryRow label="Occasion" value={occasion} />}
          </dl>

          {selectedSlot?.state === "waitlist" && (
            <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-xs text-foreground">
              <Info className="size-4 text-gold-ink" /> This slot is on the waitlist - we'll confirm by text if a table frees up.
            </p>
          )}

          {needsHuman && <Turnstile siteKey={siteKey} onToken={setHumanToken} resetKey={resetKey} />}
          <Button className="mt-5 h-13 w-full text-base font-semibold" disabled={!canConfirm} onClick={confirm}>
            {selectedSlot?.state === "waitlist" ? "Join the waitlist" : "Confirm booking"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Free to cancel up to 2 hours before.</p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function BookingConfirmation({ booking }: { booking: ApiBooking }) {
  const waitlist = booking.status === "waitlist";
  const { business: b } = useSiteContent();
  return (
    <div className="mx-auto mt-6 max-w-xl text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-jade/15 text-jade">
        {waitlist ? <Clock className="size-8" /> : <PartyPopper className="size-8" />}
      </div>
      <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight">
        {waitlist ? "You're on the waitlist" : "Table booked!"}
      </h2>
      <p className="mt-2 text-muted-foreground">
        <span className="notranslate" translate="no">{booking.name.split(" ")[0]}</span>, your reference is <span className="font-semibold text-foreground notranslate" translate="no">{booking.id}</span>.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={waitlist ? "border-gold/30 bg-gold/10 text-gold-ink" : "border-jade/30 bg-jade/10 text-jade"}>
            {waitlist ? "Waitlisted" : "Confirmed"}
          </Badge>
          <span className="text-sm text-muted-foreground">{booking.party} guests</span>
        </div>
        <p className="mt-4 font-display text-2xl font-bold">
          {new Date(booking.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <p className="text-lg">{booking.time}</p>
        {booking.requiresCall && (
          <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-sm text-foreground">
            <Phone className="size-4 text-gold-ink" /> For a party this size we&apos;ll phone you to confirm and take the deposit.
          </div>
        )}
        {waitlist && (
          <p className="mt-4 text-sm text-muted-foreground">We&apos;ll phone you if a table frees up. Your table isn&apos;t confirmed until we do.</p>
        )}
        <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
          <CheckCircle2 className="size-4" /> Need to change or cancel? Call <a className="underline" href={telHref(b.phone)}>{b.phone}</a> and quote your reference.
        </div>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="secondary" className="h-12 px-6"><Link href="/menu">Peek at the menu</Link></Button>
        <Button asChild className="h-12 px-6"><Link href="/">Back home</Link></Button>
      </div>
    </div>
  );
}
