"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, UserCheck, Clock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SectionCard, BookingStatusPill } from "@/components/admin/ui";
import { fetchBookings, patchBookingStatus, patchBooking } from "@/lib/admin/api";
import { suggestTable, type Booking, type BookingStatus } from "@/lib/booking";
import { cn } from "@/lib/utils";

const STATUSES: BookingStatus[] = ["upcoming", "seated", "completed", "cancelled", "no-show", "delayed", "waitlist"];

const FILTERS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "waitlist", label: "Waitlist" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
] as const;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingsView() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("today");
  const [editing, setEditing] = useState<Booking | null>(null);

  useEffect(() => { fetchBookings().then((b) => { setBookings(b); setReady(true); }); }, []);

  const today = todayStr();
  const rows = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    switch (filter) {
      case "today": return sorted.filter((b) => b.date === today);
      case "upcoming": return sorted.filter((b) => b.date >= today && (b.status === "upcoming" || b.status === "seated" || b.status === "delayed"));
      case "waitlist": return sorted.filter((b) => b.status === "waitlist");
      case "past": return sorted.filter((b) => b.date < today);
      default: return sorted;
    }
  }, [bookings, filter, today]);

  async function set(b: Booking, patch: Partial<Booking>, msg: string) {
    const ok = await patchBookingStatus(b.id, patch.status as BookingStatus, patch.tableId);
    if (ok) { setBookings(await fetchBookings()); toast.success(msg); }
    else toast.error("Could not update booking.");
  }

  function actionsFor(b: Booking) {
    switch (b.status) {
      case "upcoming":
      case "delayed":
        return (
          <>
            <Button size="sm" className="h-8 gap-1" onClick={() => set(b, { status: "seated", tableId: suggestTable(b.party, b.date, b.time, bookings) }, `${b.name} seated`)}><UserCheck className="size-3.5" /> <span className="hidden sm:inline">Seat</span></Button>
            <Button size="icon-sm" variant="ghost" aria-label="No-show" onClick={() => set(b, { status: "no-show" }, `${b.name} marked no-show`)}><Clock className="size-4" /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => set(b, { status: "cancelled" }, `${b.name} cancelled`)}><X className="size-4" /></Button>
          </>
        );
      case "seated":
        return <Button size="sm" className="h-8 gap-1" onClick={() => set(b, { status: "completed" }, `${b.name} completed`)}><Check className="size-3.5" /> <span className="hidden sm:inline">Complete</span></Button>;
      case "waitlist":
        return (
          <>
            <Button size="sm" className="h-8 gap-1" onClick={() => set(b, { status: "upcoming" }, `${b.name} confirmed`)}><Check className="size-3.5" /> <span className="hidden sm:inline">Confirm</span></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => set(b, { status: "cancelled" }, `${b.name} cancelled`)}><X className="size-4" /></Button>
          </>
        );
      default:
        return <span className="text-xs text-muted-foreground">-</span>;
    }
  }

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const todayCount = bookings.filter((b) => b.date === today && b.status !== "cancelled").length;
  const waitlistCount = bookings.filter((b) => b.status === "waitlist").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground">{todayCount} today · {waitlistCount} on waitlist</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition", filter === f.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}>
            {f.label}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Party</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.time}{b.tableId && <span className="block text-xs text-muted-foreground">{b.tableId}</span>}</TableCell>
                  <TableCell>{b.name}<span className="block text-xs text-muted-foreground">{b.id}</span></TableCell>
                  <TableCell>{b.party}</TableCell>
                  <TableCell className="hidden sm:table-cell">{new Date(b.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</TableCell>
                  <TableCell className="hidden max-w-40 truncate md:table-cell text-muted-foreground">{b.occasion ?? ""}{b.dietary ? ` · ${b.dietary}` : ""}</TableCell>
                  <TableCell><BookingStatusPill status={b.status} /></TableCell>
                  <TableCell className="text-right"><div className="flex items-center justify-end gap-1.5">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}><Pencil className="size-4" /></Button>
                    {actionsFor(b)}
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No bookings in this view.</p>}
        </div>
      </SectionCard>

      <BookingEditDialog
        booking={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setBookings(await fetchBookings()); setEditing(null); }}
      />
    </div>
  );
}

function BookingEditDialog({ booking, onClose, onSaved }: { booking: Booking | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Booking>>({});
  useEffect(() => { if (booking) setForm({ ...booking }); }, [booking]);

  async function save() {
    if (!booking) return;
    const ok = await patchBooking(booking.id, {
      name: form.name, phone: form.phone, date: form.date, time: form.time,
      party: Number(form.party), status: form.status, tableId: form.tableId || undefined,
      occasion: form.occasion, dietary: form.dietary, notes: form.notes,
    });
    if (ok) { toast.success("Booking updated"); onSaved(); }
    else toast.error("Could not save booking.");
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {booking && (
          <>
            <DialogHeader><DialogTitle className="font-display">Edit booking · {booking.id}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">Name</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Date</Label><Input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Time</Label><Input type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Party</Label><Input type="number" value={form.party ?? 2} onChange={(e) => setForm({ ...form, party: Number(e.target.value) })} className="mt-1 h-10" inputMode="numeric" /></div>
              <div><Label className="text-xs">Table</Label><Input value={form.tableId ?? ""} onChange={(e) => setForm({ ...form, tableId: e.target.value })} className="mt-1 h-10" placeholder="e.g. T5" /></div>
              <div>
                <Label className="text-xs">Status</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BookingStatus })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm capitalize">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Occasion</Label><Input value={form.occasion ?? ""} onChange={(e) => setForm({ ...form, occasion: e.target.value })} className="mt-1 h-10" /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Dietary / notes</Label><Input value={form.dietary ?? ""} onChange={(e) => setForm({ ...form, dietary: e.target.value })} className="mt-1 h-10" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save}>Save changes</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
