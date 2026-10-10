import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, isStaffRole } from "@/server/auth";
import { canAccess, parsePermissions } from "@/lib/admin/sections";
import { bookingStatusSchema } from "@/server/validation";
import { isRealDate } from "@/server/order-time";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { clientIp } from "@/server/rate-limit";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  const perms = u ? parsePermissions(u.permissions) : [];
  if (!u || !isStaffRole(u.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bookingStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking update." }, { status: 400 });

  // Floor-plan staff may seat guests (status/table); editing the booking itself needs Bookings access.
  const onlySeating = Object.keys(parsed.data).every((k) => k === "status" || k === "tableId");
  const allowed = canAccess("bookings", u.role, perms) || (onlySeating && canAccess("floor", u.role, perms));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (parsed.data.date && !isRealDate(parsed.data.date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const { id } = await ctx.params;
  const before = await prisma.booking.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const booking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id }, data: parsed.data });
    const changed = Object.fromEntries(Object.keys(parsed.data).map((k) => [k, { from: (before as Record<string, unknown>)[k], to: (updated as Record<string, unknown>)[k] }]));
    await audit({ actor: actorOf(u), action: "booking.update", entity: "booking", entityId: id, detail: changed, ip: clientIp(req) }, tx);
    return updated;
  });
  return NextResponse.json({ booking });
}
