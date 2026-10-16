import { RESTAURANT } from "@/lib/data/site";
import { TABLES, BOOKING_POLICY, totalSeats, type Table } from "@/lib/data/tables";

export type BookingStatus =
  | "upcoming" | "seated" | "completed" | "cancelled" | "no-show" | "delayed" | "waitlist";

export interface Booking {
  id: string;
  createdAt: number;
  name: string;
  phone: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  party: number;
  status: BookingStatus;
  tableId?: string;
  occasion?: string;
  dietary?: string;
  notes?: string;
  email?: string;
  userId?: string;
  requiresCall?: boolean;
}

export type SlotState = "available" | "waitlist" | "full";
export interface Slot { time: string; state: SlotState; seatsLeft: number }

function toMin(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function toHHMM(min: number) { const h = Math.floor(min / 60); const m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

export function dayIndexFromDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // timezone-proof
}

export function isPeak(date: string): boolean {
  return BOOKING_POLICY.peakDays.includes(dayIndexFromDate(date));
}

export function turnTime(party: number): number {
  return party <= 4 ? BOOKING_POLICY.turnTimeMins.small : BOOKING_POLICY.turnTimeMins.large;
}

export function needsDeposit(party: number): boolean {
  return party >= BOOKING_POLICY.depositThresholdParty;
}

/** Can a single table or an allowed 2-table combo seat the party (ignoring what's already booked)? */
export function canSeatParty(party: number, tables: Table[] = TABLES): boolean {
  return fitsTables([party], tables);
}

/**
 * Can these parties all be seated at once? Greedy: biggest party first, each takes the smallest
 * free table that fits, or (for parties bigger than any table) a free pair of combinable tables.
 */
export function fitsTables(parties: number[], tables: Table[] = TABLES): boolean {
  const free = new Set(tables.map((t) => t.id));
  for (const party of [...parties].sort((a, b) => b - a)) {
    const single = tables.filter((t) => free.has(t.id) && t.seats >= party).sort((a, b) => a.seats - b.seats)[0];
    if (single) { free.delete(single.id); continue; }
    // No single table free: try two combinable tables pushed together (e.g. 2+2 for a party of 4).
    let best: [string, string, number] | null = null;
    for (const t of tables) {
      if (!free.has(t.id)) continue;
      for (const otherId of t.combinesWith ?? []) {
        const o = tables.find((x) => x.id === otherId);
        if (o && free.has(o.id) && t.seats + o.seats >= party && (!best || t.seats + o.seats < best[2])) best = [t.id, o.id, t.seats + o.seats];
      }
    }
    if (!best) return false;
    free.delete(best[0]); free.delete(best[1]);
  }
  return true;
}

const OCCUPYING = new Set<BookingStatus>(["upcoming", "seated", "delayed"]);
const stayWindow = (b: { time: string; party: number }) => {
  const start = toMin(b.time);
  return [start, start + turnTime(b.party) + BOOKING_POLICY.bufferMins] as const;
};

/**
 * For a new party arriving at `time`, look at EVERY moment of its stay (not just the arrival time:
 * a group booked for 19:30 is still at the table when an earlier group would be).
 * Returns the most seats taken at any moment, and whether the tables can hold everyone at every moment.
 */
function stayCheck(bookings: Booking[], date: string, time: string, party: number, tables: Table[]): { peakSeats: number; tablesFit: boolean } {
  const [start, end] = stayWindow({ time, party });
  const others = bookings.filter((b) => b.date === date && OCCUPYING.has(b.status)).map((b) => ({ party: b.party, w: stayWindow(b) }));
  let peakSeats = 0;
  let tablesFit = true;
  // Occupancy only changes when someone arrives, so check our arrival and every arrival during our stay.
  const moments = new Set([start, ...others.map((o) => o.w[0]).filter((t) => t > start && t < end)]);
  for (const t of moments) {
    const present = others.filter((o) => o.w[0] <= t && t < o.w[1]).map((o) => o.party);
    peakSeats = Math.max(peakSeats, present.reduce((n, p) => n + p, 0));
    if (tablesFit && !fitsTables([...present, party], tables)) tablesFit = false;
  }
  return { peakSeats, tablesFit };
}

/**
 * Bookable slots for a date. `notBefore` (minutes since midnight, UK time) hides slots that are
 * already past or too soon, when the date is today.
 */
export function slotsForDate(
  date: string, party: number, bookings: Booking[],
  openingHours: typeof RESTAURANT.hours = RESTAURANT.hours, notBefore = -1, tables: Table[] = TABLES,
): Slot[] {
  const hours = openingHours[dayIndexFromDate(date)];
  if (!hours?.sessions.length) return [];

  const step = BOOKING_POLICY.slotStepMins;
  const reservePct = isPeak(date) ? BOOKING_POLICY.walkInReservePct.peak : BOOKING_POLICY.walkInReservePct.standard;
  const seats = totalSeats(tables);
  const bookableCapacity = seats - Math.round(seats * reservePct); // walk-in reserve is never booked online
  const seatable = canSeatParty(party, tables);

  const slots: Slot[] = [];
  for (const session of hours.sessions) {
    const open = toMin(session.open);
    const last = toMin(session.close) - turnTime(party); // last seating leaves time to finish
    for (let t = open; t <= last; t += step) {
      if (t < notBefore) continue;
      const time = toHHMM(t);
      const { peakSeats, tablesFit } = stayCheck(bookings, date, time, party, tables);
      const seatsLeft = bookableCapacity - peakSeats;
      let state: SlotState;
      if (!seatable || !tablesFit || seats - peakSeats < party) state = "full";
      else if (seatsLeft >= party) state = "available";
      else state = "waitlist"; // would eat into the walk-in reserve: staff decide
      slots.push({ time, state, seatsLeft: Math.max(0, seatsLeft) });
    }
  }
  return slots;
}

/** Assign the smallest suitable free table (greedy) for admin seating. */
export function suggestTable(party: number, date: string, time: string, bookings: Booking[], tables: Table[] = TABLES): string | undefined {
  const t = toMin(time);
  const taken = new Set(
    bookings
      .filter((b) => b.date === date && b.tableId && OCCUPYING.has(b.status) && stayWindow(b)[0] <= t && t < stayWindow(b)[1])
      .map((b) => b.tableId as string),
  );
  const candidates = tables.filter((tb) => tb.seats >= party && !taken.has(tb.id)).sort((a, b) => a.seats - b.seats);
  return candidates[0]?.id;
}
