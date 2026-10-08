import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { bookingStatusSchema } from "@/server/validation";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || (u.role !== "staff" && u.role !== "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bookingStatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking update." }, { status: 400 });

  const booking = await prisma.booking.update({
    where: { id },
    data: parsed.data,
  }).catch(() => null);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ booking });
}
