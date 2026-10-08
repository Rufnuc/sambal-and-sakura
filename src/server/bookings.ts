import { prisma } from "@/server/db";
import { getBlackouts } from "@/server/settings";
import { slotsForDate, canSeatParty, type Booking as LibBooking, type Slot } from "@/lib/booking";
import { MAX_ONLINE_PARTY } from "@/lib/data/tables";
import { getSiteContent } from "@/server/site-content";

const ACTIVE = ["upcoming", "seated", "delayed", "waitlist"];

function toLib(rows: { date: string; time: string; party: number; status: string; tableId: string | null }[]): LibBooking[] {
  return rows.map((r) => ({
    id: "", createdAt: 0, name: "", phone: "",
    date: r.date, time: r.time, party: r.party,
    status: r.status as LibBooking["status"], tableId: r.tableId ?? undefined,
  }));
}

export async function getAvailability(date: string, party: number): Promise<Slot[]> {
  if ((await getBlackouts()).includes(date)) return [];
  const rows = await prisma.booking.findMany({
    where: { date, status: { in: ACTIVE } },
    select: { date: true, time: true, party: true, status: true, tableId: true },
  });
  const { business } = await getSiteContent();
  return slotsForDate(date, party, toLib(rows), business.hours);
}

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

function bookingRef() { return "BK-" + Math.random().toString(36).slice(2, 7).toUpperCase(); }

export interface NewBooking {
  name: string; phone: string; email?: string;
  date: string; time: string; party: number;
  occasion?: string; dietary?: string; notes?: string;
}

/** Create a booking with a server-authoritative capacity re-check (transactional). */
export async function createBooking(data: NewBooking, userId?: string) {
  if (data.party > MAX_ONLINE_PARTY) throw new BookingError(`Parties over ${MAX_ONLINE_PARTY} must call the restaurant.`, 400);
  if (!canSeatParty(data.party)) throw new BookingError("We can't seat a party that size online.", 400);
  if ((await getBlackouts()).includes(data.date)) throw new BookingError("We're closed on that date.", 409);

  const { business } = await getSiteContent();

  return prisma.$transaction(async (tx) => {
    const rows = await tx.booking.findMany({
      where: { date: data.date, status: { in: ACTIVE } },
      select: { date: true, time: true, party: true, status: true, tableId: true },
    });
    const slot = slotsForDate(data.date, data.party, toLib(rows), business.hours).find((s) => s.time === data.time);
    if (!slot || slot.state === "full") throw new BookingError("That slot is no longer available.", 409);

    return tx.booking.create({
      data: {
        id: bookingRef(),
        userId: userId ?? null,
        name: data.name, phone: data.phone, email: data.email || null,
        date: data.date, time: data.time, party: data.party,
        status: slot.state === "waitlist" ? "waitlist" : "upcoming",
        occasion: data.occasion || null, dietary: data.dietary || null, notes: data.notes || null,
      },
    });
  });
}
