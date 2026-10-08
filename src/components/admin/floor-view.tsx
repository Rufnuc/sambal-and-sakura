"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, Armchair, ShieldCheck } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchBookings } from "@/lib/admin/api";
import { isPeak, type Booking } from "@/lib/booking";
import { TABLES, TOTAL_SEATS, BOOKING_POLICY } from "@/lib/data/tables";
import { cn } from "@/lib/utils";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FloorView() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { fetchBookings().then((b) => { setBookings(b); setReady(true); }); }, []);

  const today = todayStr();
  const todays = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);

  const seatedByTable = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of todays) if (b.status === "seated" && b.tableId) map.set(b.tableId, b);
    return map;
  }, [todays]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const peak = isPeak(today);
  const reservePct = peak ? BOOKING_POLICY.walkInReservePct.peak : BOOKING_POLICY.walkInReservePct.standard;
  const walkInReserve = Math.round(TOTAL_SEATS * reservePct);
  const seatedCovers = [...seatedByTable.values()].reduce((n, b) => n + b.party, 0);
  const upcomingCovers = todays.filter((b) => b.status === "upcoming" || b.status === "delayed").reduce((n, b) => n + b.party, 0);
  const available = Math.max(0, TOTAL_SEATS - walkInReserve - seatedCovers - upcomingCovers);

  const zones = [...new Set(TABLES.map((t) => t.zone))];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Floor plan</h1>
        <p className="text-muted-foreground">
          Live table status · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} {peak && <span className="text-gold-ink">· Peak night</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total seats" value={String(TOTAL_SEATS)} accent="gold" />
        <StatCard label="Seated now" value={String(seatedCovers)} sub={`${seatedByTable.size} tables`} accent="jade" />
        <StatCard label="Walk-in reserve" value={String(walkInReserve)} sub={`${Math.round(reservePct * 100)}% held`} accent="sambal" />
        <StatCard label="Bookable left" value={String(available)} sub="after reserve" accent="sakura" />
      </div>

      <SectionCard title="Capacity">
        <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
          <div className="bg-jade" style={{ width: `${(seatedCovers / TOTAL_SEATS) * 100}%` }} title={`Seated: ${seatedCovers}`} />
          <div className="bg-gold" style={{ width: `${(upcomingCovers / TOTAL_SEATS) * 100}%` }} title={`Upcoming: ${upcomingCovers}`} />
          <div className="bg-sambal/60" style={{ width: `${(walkInReserve / TOTAL_SEATS) * 100}%` }} title={`Walk-in reserve: ${walkInReserve}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Legend color="bg-jade" label={`Seated (${seatedCovers})`} />
          <Legend color="bg-gold" label={`Upcoming (${upcomingCovers})`} />
          <Legend color="bg-sambal/60" label={`Walk-in reserve (${walkInReserve})`} />
          <Legend color="bg-muted-foreground/30" label={`Free (${available})`} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-jade"><ShieldCheck className="size-4" /> Walk-in protection keeps {Math.round(reservePct * 100)}% of seats open - online booking can't consume them.</p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {zones.map((zone) => (
          <SectionCard key={zone} title={`${zone} zone`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TABLES.filter((t) => t.zone === zone).map((t) => {
                const occ = seatedByTable.get(t.id);
                return (
                  <div key={t.id} className={cn(
                    "flex flex-col items-center justify-center rounded-xl border p-4 text-center transition",
                    occ ? "border-jade/40 bg-jade/10" : "border-border bg-muted/30",
                  )}>
                    <Armchair className={cn("size-6", occ ? "text-jade" : "text-muted-foreground")} />
                    <p className="mt-1 font-display font-bold">{t.id}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" /> {t.seats}</p>
                    {occ ? (
                      <p className="mt-1 truncate text-xs font-medium text-jade">{occ.name} · {occ.party}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Free</p>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", color)} /> {label}</span>;
}
