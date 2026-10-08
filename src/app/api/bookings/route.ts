import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { createBooking, BookingError } from "@/server/bookings";
import { createBookingSchema } from "@/server/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your booking details." }, { status: 400 });

  const user = await currentUser();
  try {
    const booking = await createBooking({ ...parsed.data, email: parsed.data.email || user?.email }, user?.id);
    return NextResponse.json({ booking });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create booking." }, { status: 500 });
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ bookings: [] });
  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: [{ date: "desc" }, { time: "desc" }],
    take: 25,
  });
  return NextResponse.json({ bookings });
}
