"use client";

import { useEffect, useState } from "react";
import { CalendarX, Plus, Trash2, Bike, ShieldCheck, Clock, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/ui";
import { ORDERING } from "@/lib/data/site";
import { BOOKING_POLICY, MAX_ONLINE_PARTY, TOTAL_SEATS } from "@/lib/data/tables";
import {
  fetchSettings, saveSettings, fetchConfig, saveConfig, changePassword, type ZoneCfg,
} from "@/lib/admin/api";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [disabledZones, setDisabledZones] = useState<string[]>([]);
  const [zones, setZones] = useState<ZoneCfg[]>([]);
  const [newDate, setNewDate] = useState("");
  const [maxMiles, setMaxMiles] = useState(6);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    Promise.all([fetchSettings(), fetchConfig()]).then(([s, c]) => {
      setBlackouts(s.blackouts); setDisabledZones(s.disabledZones); setZones(c.zones); setMaxMiles(c.maxMiles ?? 6); setReady(true);
    });
  }, []);

  async function saveMiles() { const c = await saveConfig({ maxMiles }); setMaxMiles(c.maxMiles ?? maxMiles); toast.success("Delivery range saved"); }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  async function addDate() {
    if (!newDate || blackouts.includes(newDate)) return;
    const s = await saveSettings({ blackouts: [...blackouts, newDate].sort() });
    setBlackouts(s.blackouts);
    toast.success("Date closed for bookings");
    setNewDate("");
  }

  function updateZone(i: number, patch: Partial<ZoneCfg>) {
    setZones((z) => z.map((zz, idx) => (idx === i ? { ...zz, ...patch } : zz)));
  }
  function addZone() {
    setZones((z) => [...z, { id: "z" + (z.length + 1) + Date.now().toString(36).slice(-3), label: "New zone", postcodes: [], fee: 2.99, etaMins: 40 }]);
  }
  async function saveZones() {
    const c = await saveConfig({ zones });
    setZones(c.zones);
    toast.success("Delivery zones saved");
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error("New passwords don't match."); return; }
    const res = await changePassword(pw.current, pw.next);
    if (res.ok) { toast.success("Password updated"); setPw({ current: "", next: "", confirm: "" }); }
    else toast.error(res.error ?? "Could not change password.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Account, availability, delivery zones and operating rules</p>
      </div>

      {/* Password */}
      <SectionCard title="Change your password" action={<KeyRound className="size-5 text-gold" />}>
        <form onSubmit={submitPassword} className="grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor="pw-cur">Current</Label><Input id="pw-cur" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="mt-1.5 h-11" autoComplete="current-password" required /></div>
          <div><Label htmlFor="pw-new">New (min 8)</Label><Input id="pw-new" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="mt-1.5 h-11" minLength={8} autoComplete="new-password" required /></div>
          <div><Label htmlFor="pw-con">Confirm</Label><Input id="pw-con" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="mt-1.5 h-11" minLength={8} autoComplete="new-password" required /></div>
          <Button type="submit" className="h-11 w-fit gap-1.5 sm:col-span-3">Update password</Button>
        </form>
      </SectionCard>

      {/* Blackout dates */}
      <SectionCard title="Blackout dates" action={<CalendarX className="size-5 text-sambal" />}>
        <p className="mb-4 text-sm text-muted-foreground">Close specific dates for online bookings (holidays, private events).</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><Label htmlFor="bo-date">Add a date</Label><Input id="bo-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1.5 h-11 w-48" /></div>
          <Button className="h-11 gap-1.5" onClick={addDate} disabled={!newDate}><Plus className="size-4" /> Add</Button>
        </div>
        {blackouts.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {blackouts.map((d) => (
              <li key={d} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm">
                {new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                <button aria-label={`Remove ${d}`} onClick={async () => { const s = await saveSettings({ blackouts: blackouts.filter((x) => x !== d) }); setBlackouts(s.blackouts); toast("Date re-opened"); }} className="text-muted-foreground hover:text-sambal"><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted-foreground">No blackout dates.</p>}
      </SectionCard>

      {/* Delivery zones CRUD */}
      <SectionCard title="Delivery zones" action={<Button size="sm" className="h-9 gap-1.5" onClick={saveZones}><Save className="size-4" /> Save zones</Button>}>
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Bike className="size-4 text-primary" /> Add, edit or pause delivery zones. Postcodes are outward codes (e.g. TS1, TS4), comma-separated.</p>
        <div className="flex flex-col gap-3">
          {zones.map((z, i) => {
            const paused = disabledZones.includes(z.id);
            return (
              <div key={z.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.4fr_2fr_0.8fr_0.8fr_auto] sm:items-end">
                <div><Label className="text-xs">Name</Label><Input value={z.label} onChange={(e) => updateZone(i, { label: e.target.value })} className="mt-1 h-10" /></div>
                <div><Label className="text-xs">Postcodes</Label><Input value={z.postcodes.join(", ")} onChange={(e) => updateZone(i, { postcodes: e.target.value.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean) })} className="mt-1 h-10" /></div>
                <div><Label className="text-xs">Fee £</Label><Input type="number" step="0.5" value={z.fee} onChange={(e) => updateZone(i, { fee: Number(e.target.value) })} className="mt-1 h-10" inputMode="decimal" /></div>
                <div><Label className="text-xs">ETA min</Label><Input type="number" value={z.etaMins} onChange={(e) => updateZone(i, { etaMins: Number(e.target.value) })} className="mt-1 h-10" inputMode="numeric" /></div>
                <div className="flex items-center gap-1">
                  <button onClick={async () => { const next = paused ? disabledZones.filter((x) => x !== z.id) : [...disabledZones, z.id]; const s = await saveSettings({ disabledZones: next }); setDisabledZones(s.disabledZones); }} role="switch" aria-checked={!paused} aria-label="Zone active" className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", paused ? "bg-muted" : "bg-jade")}>
                    <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", paused ? "translate-x-1" : "translate-x-6")} />
                  </button>
                  <button aria-label="Remove zone" onClick={() => setZones((zz) => zz.filter((_, idx) => idx !== i))} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-sambal"><Trash2 className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="outline" className="mt-3 h-10 gap-1.5" onClick={addZone}><Plus className="size-4" /> Add zone</Button>
        <p className="mt-3 text-xs text-muted-foreground">Free delivery over {gbp(ORDERING.freeDeliveryThreshold)} · minimum order {gbp(ORDERING.minOrder)}. Remember to Save zones after editing.</p>
      </SectionCard>

      {/* Max delivery range */}
      <SectionCard title="Maximum delivery range" action={<Button size="sm" className="h-9 gap-1.5" onClick={saveMiles}><Save className="size-4" /> Save</Button>}>
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Bike className="size-4 text-primary" /> Reject delivery orders further than this many miles from the restaurant (set 0 to disable). Checked against the customer&apos;s postcode at checkout.</p>
        <div className="flex items-end gap-3">
          <div><Label className="text-xs">Max miles</Label><Input type="number" step="0.5" value={maxMiles} onChange={(e) => setMaxMiles(Number(e.target.value))} className="mt-1 h-10 w-32" inputMode="decimal" /></div>
        </div>
      </SectionCard>

      {/* Rules */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Booking rules" action={<ShieldCheck className="size-5 text-jade" />}>
          <dl className="divide-y divide-border text-sm">
            <Rule label="Total covers" value={`${TOTAL_SEATS} seats`} />
            <Rule label="Walk-in reserve (peak)" value={`${Math.round(BOOKING_POLICY.walkInReservePct.peak * 100)}%`} />
            <Rule label="Walk-in reserve (standard)" value={`${Math.round(BOOKING_POLICY.walkInReservePct.standard * 100)}%`} />
            <Rule label="Deposit from" value={`${BOOKING_POLICY.depositThresholdParty}+ guests`} />
            <Rule label="Max online party" value={`${MAX_ONLINE_PARTY} guests`} />
          </dl>
        </SectionCard>
        <SectionCard title="Order rules" action={<Clock className="size-5 text-gold" />}>
          <dl className="divide-y divide-border text-sm">
            <Rule label="Payment" value="Cash only" />
            <Rule label="Minimum delivery order" value={gbp(ORDERING.minOrder)} />
            <Rule label="Free delivery threshold" value={gbp(ORDERING.freeDeliveryThreshold)} />
            <Rule label="Average prep time" value={`${ORDERING.prepTimeMins} min`} />
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}
