import { RESTAURANT } from "@/lib/data/site";
import { TABLES, TOTAL_SEATS, LARGEST_TABLE, BOOKING_POLICY } from "@/lib/data/tables";

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
}

export type SlotState = "available" | "waitlist" | "full";
export interface Slot { time: string; state: SlotState; seatsLeft: number }

function toMin(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function toHHMM(min: number) { const h = Math.floor(min / 60); const m = min % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

export function dayIndexFromDate(date: string): number {
  // date is YYYY-MM-DD, construct local date
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
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

/** Can a single table or an allowed 2-table combo seat the party? */
export function canSeatParty(party: number): boolean {
  if (party <= LARGEST_TABLE) return true;
  // try combos
  for (const t of TABLES) {
    if (!t.combinesWith) continue;
    for (const otherId of t.combinesWith) {
      const other = TABLES.find((x) => x.id === otherId);
      if (other && t.seats + other.seats >= party) return true;
    }
  }
  return false;
}

/** Seats already committed at a given slot (overlapping turn windows). */
function committedSeats(bookings: Booking[], date: string, time: string): number {
  const slotStart = toMin(time);
  return bookings
    .filter((b) => b.date === date && (b.status === "upcoming" || b.status === "seated" || b.status === "delayed"))
    .filter((b) => {
      const bStart = toMin(b.time);
      const bEnd = bStart + turnTime(b.party) + BOOKING_POLICY.bufferMins;
      // overlap if slotStart falls within an existing booking's window
      return slotStart >= bStart && slotStart < bEnd;
    })
    .reduce((n, b) => n + b.party, 0);
}

export function slotsForDate(date: string, party: number, bookings: Booking[], openingHours: typeof RESTAURANT.hours = RESTAURANT.hours): Slot[] {
  const dayIdx = dayIndexFromDate(date);
  const hours = openingHours[dayIdx];
  if (!hours?.sessions.length) return [];

  const step = BOOKING_POLICY.slotStepMins;
  const reservePct = isPeak(date) ? BOOKING_POLICY.walkInReservePct.peak : BOOKING_POLICY.walkInReservePct.standard;
  const reserve = Math.round(TOTAL_SEATS * reservePct);
  const bookableCapacity = TOTAL_SEATS - reserve;

  const slots: Slot[] = [];
  for (const session of hours.sessions) {
    const open = toMin(session.open);
    const last = toMin(session.close) - turnTime(party); // last seating leaves time to finish
    for (let t = open; t <= last; t += step) {
      const time = toHHMM(t);
      const committed = committedSeats(bookings, date, time);
      const seatsLeft = bookableCapacity - committed;
      let state: SlotState;
      if (!canSeatParty(party)) state = "full";
      else if (seatsLeft >= party) state = "available";
      else if (TOTAL_SEATS - committed >= party) state = "waitlist";
      else state = "full";
      slots.push({ time, state, seatsLeft: Math.max(0, seatsLeft) });
    }
  }
  return slots;
}

const BOOKINGS_KEY = "ss_bookings";

export function bookingRef(): string {
  return "BK-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export function readBookings(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BOOKINGS_KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch { return []; }
}

export function saveBooking(b: Booking) {
  if (typeof window === "undefined") return;
  try {
    const list = readBookings();
    list.unshift(b);
    window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list.slice(0, 200)));
  } catch { /* ignore */ }
}

export function updateBooking(id: string, patch: Partial<Booking>) {
  if (typeof window === "undefined") return;
  try {
    const list = readBookings().map((b) => (b.id === id ? { ...b, ...patch } : b));
    window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

/** Assign the smallest suitable free table (greedy) for admin/demo. */
export function suggestTable(party: number, date: string, time: string, bookings: Booking[]): string | undefined {
  const taken = new Set(
    bookings
      .filter((b) => b.date === date && b.time === time && b.tableId)
      .map((b) => b.tableId as string),
  );
  const candidates = TABLES.filter((t) => t.seats >= party && !taken.has(t.id)).sort((a, b) => a.seats - b.seats);
  return candidates[0]?.id;
}
