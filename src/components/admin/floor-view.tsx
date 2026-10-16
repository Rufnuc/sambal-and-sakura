"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, ShieldCheck, Pencil, Plus, Trash2, Save, Undo2, Move } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchBookings, fetchFloorTables, saveFloorTables } from "@/lib/admin/api";
import { isPeak, turnTime, type Booking } from "@/lib/booking";
import { BOOKING_POLICY, totalSeats, type Table, type TableShape } from "@/lib/data/tables";
import { cn } from "@/lib/utils";

function todayStr() {
  // The restaurant's date (UK), whatever timezone this device is set to.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function nowMinutesUk() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clamp = (n: number) => Math.min(96, Math.max(4, n));

// Table size on the plan, as % of the plan's width (height follows from the shape).
function tableWidth(t: Table) {
  const base = 8 + Math.min(t.seats, 12) * 0.9;
  return t.shape === "long" ? base * 1.7 : base;
}
const SHAPES: { id: TableShape; label: string }[] = [{ id: "round", label: "Round" }, { id: "square", label: "Square" }, { id: "long", label: "Long" }];

type LiveState = { kind: "seated"; b: Booking } | { kind: "soon"; b: Booking } | { kind: "free" };

export function FloorView() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Table[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () => fetchBookings().then((b) => setBookings(b));
    Promise.all([load(), fetchFloorTables()]).then(([, f]) => {
      if (f) { setTables(f.tables); setCanEdit(f.canEdit); }
      setReady(true);
    });
    const id = setInterval(load, 30_000); // stay current during service
    return () => clearInterval(id);
  }, []);

  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(tables);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const today = todayStr();
  const todays = useMemo(() => bookings.filter((b) => b.date === today), [bookings, today]);

  // Live status per table: seated now, or booked within the next 2 hours, else free.
  const live = useMemo(() => {
    const map = new Map<string, LiveState>();
    const now = nowMinutesUk();
    for (const b of todays) {
      if (!b.tableId) continue;
      if (b.status === "seated") map.set(b.tableId, { kind: "seated", b });
      else if ((b.status === "upcoming" || b.status === "delayed") && !map.has(b.tableId)) {
        const start = toMin(b.time);
        if (start - now <= 120 && start + turnTime(b.party) > now) map.set(b.tableId, { kind: "soon", b });
      }
    }
    return map;
  }, [todays]);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const shown = editing ? draft : tables;
  const seats = totalSeats(shown);
  const peak = isPeak(today);
  const reservePct = peak ? BOOKING_POLICY.walkInReservePct.peak : BOOKING_POLICY.walkInReservePct.standard;
  const walkInReserve = Math.round(seats * reservePct);
  const seatedList = [...live.values()].filter((s): s is Extract<LiveState, { kind: "seated" }> => s.kind === "seated");
  const seatedCovers = seatedList.reduce((n, s) => n + s.b.party, 0);
  const upcomingCovers = todays.filter((b) => b.status === "upcoming" || b.status === "delayed").reduce((n, b) => n + b.party, 0);
  const available = Math.max(0, seats - walkInReserve - seatedCovers - upcomingCovers);
  const pct = (n: number) => `${seats ? (n / seats) * 100 : 0}%`;

  function startEdit() { setDraft(tables.map((t) => ({ ...t }))); setSelected(null); setEditing(true); }
  function discard() {
    if (dirty && !window.confirm("Discard your changes to the floor plan?")) return;
    setEditing(false); setSelected(null);
  }
  async function save() {
    setSaving(true);
    const r = await saveFloorTables(draft);
    setSaving(false);
    if (!r.ok) { toast.error(r.error); return; }
    setTables(r.tables); setEditing(false); setSelected(null);
    toast.success(`Floor plan saved: ${r.tables.length} tables, ${totalSeats(r.tables)} seats. Online booking now uses it.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Floor plan</h1>
          <p className="text-muted-foreground">
            {editing ? "Editing the layout - drag tables, or tap one to change it" : <>Live table status · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} {peak && <span className="text-gold-ink">· Peak night</span>}</>}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button variant="outline" className="h-9 gap-1.5" onClick={discard}><Undo2 className="size-4" /> {dirty ? "Discard" : "Done"}</Button>
                <Button className="h-9 gap-1.5" disabled={!dirty || saving} onClick={save}><Save className="size-4" /> {saving ? "Saving…" : "Save layout"}</Button>
              </>
            ) : (
              <Button variant="outline" className="h-9 gap-1.5" onClick={startEdit}><Pencil className="size-4" /> Edit layout</Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total seats" value={String(seats)} sub={`${shown.length} tables`} accent="gold" />
        <StatCard label="Seated now" value={String(seatedCovers)} sub={`${seatedList.length} tables`} accent="jade" />
        <StatCard label="Walk-in reserve" value={String(walkInReserve)} sub={`${Math.round(reservePct * 100)}% held`} accent="sambal" />
        <StatCard label="Bookable left" value={String(available)} sub="after reserve" accent="sakura" />
      </div>

      {editing ? (
        <LayoutEditor draft={draft} setDraft={setDraft} selected={selected} setSelected={setSelected} dirty={dirty} />
      ) : (
        <>
          <SectionCard title="Room">
            <Plan tables={tables} live={live} />
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Legend color="bg-jade" label="Seated" />
              <Legend color="bg-gold" label="Booked in the next 2 hours" />
              <Legend color="bg-muted-foreground/30" label="Free" />
            </div>
          </SectionCard>

          <SectionCard title="Capacity">
            <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-jade" style={{ width: pct(seatedCovers) }} title={`Seated: ${seatedCovers}`} />
              <div className="bg-gold" style={{ width: pct(upcomingCovers) }} title={`Upcoming: ${upcomingCovers}`} />
              <div className="bg-sambal/60" style={{ width: pct(walkInReserve) }} title={`Walk-in reserve: ${walkInReserve}`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Legend color="bg-jade" label={`Seated (${seatedCovers})`} />
              <Legend color="bg-gold" label={`Upcoming (${upcomingCovers})`} />
              <Legend color="bg-sambal/60" label={`Walk-in reserve (${walkInReserve})`} />
              <Legend color="bg-muted-foreground/30" label={`Free (${available})`} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-jade"><ShieldCheck className="size-4" /> Walk-in protection keeps {Math.round(reservePct * 100)}% of seats open - online booking can&apos;t consume them.</p>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------- live plan */

function Plan({ tables, live }: { tables: Table[]; live: Map<string, LiveState> }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] bg-[length:20px_20px] sm:aspect-[16/9]">
      {tables.map((t) => {
        const s = live.get(t.id) ?? { kind: "free" as const };
        return (
          <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${t.x ?? 50}%`, top: `${t.y ?? 50}%`, width: `${tableWidth(t)}%` }}>
            <TableShapeBox t={t} className={cn(
              s.kind === "seated" ? "border-jade bg-jade/20" : s.kind === "soon" ? "border-gold bg-gold/20" : "border-border bg-card",
            )}>
              <span className="font-display text-xs font-bold leading-none sm:text-sm">{t.id}</span>
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Users className="size-2.5" />{t.seats}</span>
            </TableShapeBox>
            {s.kind !== "free" && (
              <p className={cn("mt-0.5 truncate text-center text-[10px] font-medium leading-tight", s.kind === "seated" ? "text-jade" : "text-gold-ink")}>
                {s.b.name.split(" ")[0]} · {s.b.party}{s.kind === "soon" ? ` · ${s.b.time}` : ""}
              </p>
            )}
          </div>
        );
      })}
      {tables.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No tables yet.</p>}
    </div>
  );
}

function TableShapeBox({ t, className, children }: { t: Table; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      "flex w-full flex-col items-center justify-center border-2 shadow-sm transition",
      t.shape === "round" ? "aspect-square rounded-full" : t.shape === "long" ? "aspect-[2/1] rounded-md" : "aspect-square rounded-md",
      className,
    )}>{children}</div>
  );
}

/* ------------------------------------------------------------------------- layout editor */

function LayoutEditor({ draft, setDraft, selected, setSelected, dirty }: {
  draft: Table[]; setDraft: React.Dispatch<React.SetStateAction<Table[]>>;
  selected: string | null; setSelected: (id: string | null) => void; dirty: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const sel = draft.find((t) => t.id === selected) ?? null;
  const zones = [...new Set(draft.map((t) => t.zone))];

  const update = useCallback((id: string, patch: Partial<Table>) => {
    setDraft((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [setDraft]);

  function pointAt(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }
  function onDown(e: React.PointerEvent, t: Table) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pointAt(e);
    drag.current = { id: t.id, dx: p.x - (t.x ?? 50), dy: p.y - (t.y ?? 50), moved: false };
    setSelected(t.id);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = pointAt(e);
    d.moved = true;
    update(d.id, { x: Math.round(clamp(p.x - d.dx) * 2) / 2, y: Math.round(clamp(p.y - d.dy) * 2) / 2 });
  }
  function onUp() { drag.current = null; }
  function onKey(e: React.KeyboardEvent, t: Table) {
    const step = e.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    update(t.id, { x: clamp((t.x ?? 50) + m[0]), y: clamp((t.y ?? 50) + m[1]) });
  }

  function addTable() {
    const names = new Set(draft.map((t) => t.id.toLowerCase()));
    let n = draft.length + 1;
    while (names.has(`t${n}`)) n++;
    const t: Table = { id: `T${n}`, seats: 4, zone: sel?.zone ?? zones[0] ?? "Main", x: 50, y: 50, shape: "square", combinesWith: [] };
    setDraft((list) => [...list, t]);
    setSelected(t.id);
  }
  function remove(id: string) {
    if (!window.confirm(`Remove table ${id}? Bookings already given this table keep its name.`)) return;
    setDraft((list) => list.filter((t) => t.id !== id).map((t) => ({ ...t, combinesWith: (t.combinesWith ?? []).filter((o) => o !== id) })));
    setSelected(null);
  }
  function rename(oldId: string, next: string) {
    const v = next.slice(0, 16);
    setDraft((list) => list.map((t) => (t.id === oldId ? { ...t, id: v } : { ...t, combinesWith: (t.combinesWith ?? []).map((o) => (o === oldId ? v : o)) })));
    setSelected(v);
  }
  function toggleJoin(a: string, b: string, on: boolean) {
    // Two-way: if A joins B, B joins A.
    setDraft((list) => list.map((t) => {
      if (t.id !== a && t.id !== b) return t;
      const other = t.id === a ? b : a;
      const set = new Set(t.combinesWith ?? []);
      if (on) set.add(other); else set.delete(other);
      return { ...t, combinesWith: [...set] };
    }));
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <SectionCard title="Layout" action={<Button size="sm" variant="outline" className="h-8 gap-1" onClick={addTable}><Plus className="size-4" /> Add table</Button>}>
        <div
          ref={box}
          className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-xl border-2 border-dashed border-gold/50 bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] bg-[length:20px_20px] sm:aspect-[16/9]"
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerDown={(e) => { if (e.target === box.current) setSelected(null); }}
        >
          {draft.map((t) => (
            <button
              key={t.id + draft.indexOf(t)}
              type="button"
              aria-label={`Table ${t.id}, ${t.seats} seats. Drag to move, or use the arrow keys.`}
              aria-pressed={selected === t.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none"
              style={{ left: `${t.x ?? 50}%`, top: `${t.y ?? 50}%`, width: `${tableWidth(t)}%` }}
              onPointerDown={(e) => onDown(e, t)}
              onKeyDown={(e) => onKey(e, t)}
              onFocus={() => setSelected(t.id)}
            >
              <TableShapeBox t={t} className={cn(selected === t.id ? "border-primary bg-primary/15 ring-4 ring-primary/25" : "border-border bg-card")}>
                <span className="font-display text-xs font-bold leading-none sm:text-sm">{t.id || "?"}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Users className="size-2.5" />{t.seats}</span>
              </TableShapeBox>
            </button>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Move className="size-3.5" /> Drag tables to where they are in the room (or select one and use the arrow keys; Shift moves faster). {dirty ? "Unsaved changes." : ""}</p>
      </SectionCard>

      <SectionCard title={sel ? `Table ${sel.id || ""}` : "Table details"}>
        {!sel ? (
          <p className="text-sm text-muted-foreground">Tap a table on the plan to change its name, seats, area, shape or which tables it can join with.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ft-name" className="text-xs">Name</Label><Input id="ft-name" value={sel.id} onChange={(e) => rename(sel.id, e.target.value)} maxLength={16} className="mt-1 h-10" /></div>
              <div><Label htmlFor="ft-seats" className="text-xs">Seats</Label><Input id="ft-seats" type="number" min={1} max={30} value={sel.seats} onChange={(e) => update(sel.id, { seats: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} className="mt-1 h-10" inputMode="numeric" /></div>
            </div>
            <div>
              <Label htmlFor="ft-zone" className="text-xs">Area</Label>
              <Input id="ft-zone" list="ft-zones" value={sel.zone} onChange={(e) => update(sel.id, { zone: e.target.value.slice(0, 30) })} className="mt-1 h-10" placeholder="e.g. Window, Main, Booth" />
              <datalist id="ft-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            </div>
            <div>
              <p className="text-xs font-medium">Shape</p>
              <div className="mt-1 flex gap-2">
                {SHAPES.map((s) => (
                  <button key={s.id} type="button" onClick={() => update(sel.id, { shape: s.id })} className={cn("flex-1 rounded-lg border px-2 py-1.5 text-sm transition", (sel.shape ?? "square") === s.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium">Can be pushed together with</p>
              <p className="text-xs text-muted-foreground">For bigger groups: online booking can join two of these tables.</p>
              <div className="mt-2 grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto">
                {draft.filter((o) => o.id !== sel.id).map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                    <input type="checkbox" checked={(sel.combinesWith ?? []).includes(o.id)} onChange={(e) => toggleJoin(sel.id, o.id, e.target.checked)} />
                    {o.id} <span className="text-xs text-muted-foreground">({o.seats})</span>
                  </label>
                ))}
              </div>
            </div>
            <Button variant="outline" className="h-10 gap-1.5 border-sambal/40 text-sambal" onClick={() => remove(sel.id)}><Trash2 className="size-4" /> Remove table</Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", color)} /> {label}</span>;
}
