import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { createBooking, BookingError } from "@/server/bookings";
import { createBookingSchema } from "@/server/validation";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { verifyHuman, turnstileSiteKey } from "@/server/turnstile";
import { phoneKey } from "@/server/phone";
import { log, errInfo } from "@/server/log";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your booking details." }, { status: 400 });
  const ip = clientIp(req);
  const user = await currentUser();

  // Stops a script from booking out a whole evening.
  const limited = await limitOr429([
    { name: "booking-ip", id: ip, limit: user ? 6 : 3, windowSec: 3600 },
    { name: "booking-phone", id: phoneKey(parsed.data.phone), limit: 4, windowSec: 86400 },
  ], "Too many bookings in a short time. Please call us and we'll sort it out.");
  if (limited) return limited;
  if (!user && !(await verifyHuman(parsed.data.turnstileToken, ip))) {
    return NextResponse.json({ error: "Please complete the security check and try again." }, { status: 400 });
  }

  try {
    const { turnstileToken: _t, ...data } = parsed.data;
    const booking = await createBooking(data, user?.id);
    return NextResponse.json({ booking });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    log.error("booking_create_failed", errInfo(e));
    return NextResponse.json({ error: "Could not create booking." }, { status: 500 });
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ bookings: [], turnstileSiteKey: turnstileSiteKey() });
  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: [{ date: "desc" }, { time: "desc" }],
    take: 25,
  });
  return NextResponse.json({ bookings, turnstileSiteKey: null });
}
