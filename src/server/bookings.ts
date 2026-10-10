import { prisma } from "@/server/db";
import { getBlackouts } from "@/server/settings";
import { slotsForDate, canSeatParty, needsDeposit, type Booking as LibBooking, type Slot } from "@/lib/booking";
import { MAX_ONLINE_PARTY } from "@/lib/data/tables";
import { getSiteContent } from "@/server/site-content";
import { ukParts, isRealDate, addDays } from "@/server/order-time";
import { bookingRef, withFreshIds } from "@/server/ids";
import { canonicalPhone } from "@/server/phone";
import { log } from "@/server/log";

const ACTIVE = ["upcoming", "seated", "delayed", "waitlist"];
const MAX_DAYS_AHEAD = 90;
const MIN_NOTICE_MINS = 30;
const IS_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres");

function toLib(rows: { date: string; time: string; party: number; status: string; tableId: string | null }[]): LibBooking[] {
  return rows.map((r) => ({
    id: "", createdAt: 0, name: "", phone: "",
    date: r.date, time: r.time, party: r.party,
    status: r.status as LibBooking["status"], tableId: r.tableId ?? undefined,
  }));
}

/** "" if the date is bookable online, otherwise why not. */
function dateProblem(date: string): string {
  if (!isRealDate(date)) return "Please pick a valid date.";
  const today = ukParts(new Date()).dateKey;
  if (date < today) return "That date has passed.";
  if (date > addDays(today, MAX_DAYS_AHEAD)) return `We take online bookings up to ${MAX_DAYS_AHEAD} days ahead - please call for later dates.`;
  return "";
}

/** For today's date: slots earlier than now + notice are hidden. */
function notBefore(date: string): number {
  const now = ukParts(new Date());
  return date === now.dateKey ? now.minutes + MIN_NOTICE_MINS : -1;
}

export async function getAvailability(date: string, party: number): Promise<Slot[]> {
  if (dateProblem(date) || (await getBlackouts()).includes(date)) return [];
  const rows = await prisma.booking.findMany({
    where: { date, status: { in: ACTIVE } },
    select: { date: true, time: true, party: true, status: true, tableId: true },
  });
  const { business } = await getSiteContent();
  return slotsForDate(date, party, toLib(rows), business.hours, notBefore(date));
}

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

export interface NewBooking {
  name: string; phone: string; email?: string;
  date: string; time: string; party: number;
  occasion?: string; dietary?: string; notes?: string;
}

/** Create a booking with a server-authoritative capacity re-check, serialised per date. */
export async function createBooking(data: NewBooking, userId?: string) {
  if (data.party > MAX_ONLINE_PARTY) throw new BookingError(`Parties over ${MAX_ONLINE_PARTY} must call the restaurant.`, 400);
  if (!canSeatParty(data.party)) throw new BookingError("We can't seat a party that size online.", 400);
  const problem = dateProblem(data.date);
  if (problem) throw new BookingError(problem, 400);
  if ((await getBlackouts()).includes(data.date)) throw new BookingError("We're closed on that date.", 409);

  const phone = canonicalPhone(data.phone);
  const { business } = await getSiteContent();

  const booking = await withFreshIds(() => prisma.$transaction(async (tx) => {
    // Postgres: one booking at a time per date, so two people can't both take the last table.
    // (SQLite, used locally, already runs one write transaction at a time.)
    if (IS_POSTGRES) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"booking:" + data.date}))`;

    const sameDay = await tx.booking.count({ where: { phone, date: data.date, status: { in: ACTIVE } } });
    if (sameDay > 0) throw new BookingError("You already have a booking that day. Please call us to change it.", 409);

    const rows = await tx.booking.findMany({
      where: { date: data.date, status: { in: ACTIVE } },
      select: { date: true, time: true, party: true, status: true, tableId: true },
    });
    const slot = slotsForDate(data.date, data.party, toLib(rows), business.hours, notBefore(data.date)).find((s) => s.time === data.time);
    if (!slot || slot.state === "full") throw new BookingError("That slot is no longer available.", 409);

    return tx.booking.create({
      data: {
        id: bookingRef(),
        userId: userId ?? null,
        name: data.name, phone, email: data.email || null,
        date: data.date, time: data.time, party: data.party,
        status: slot.state === "waitlist" ? "waitlist" : "upcoming",
        requiresCall: needsDeposit(data.party),
        occasion: data.occasion || null, dietary: data.dietary || null, notes: data.notes || null,
      },
    });
  }), ["id"]);
  log.info("booking_created", { bookingId: booking.id, date: booking.date, party: booking.party, status: booking.status });
  return booking;
}
