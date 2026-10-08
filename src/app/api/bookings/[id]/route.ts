import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";

// Customers can cancel their own upcoming bookings.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.userId !== user.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (["completed", "cancelled", "no-show"].includes(booking.status)) {
    return NextResponse.json({ error: "This booking can no longer be changed." }, { status: 400 });
  }
  const updated = await prisma.booking.update({ where: { id }, data: { status: "cancelled" } });
  return NextResponse.json({ booking: updated });
}
