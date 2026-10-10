import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, isStaffRole } from "@/server/auth";
import { canAccess, parsePermissions } from "@/lib/admin/sections";
import { ukParts, addDays, isRealDate } from "@/server/order-time";

// Bookings from yesterday onwards by default (upcoming reservations are never cut off by old ones).
// ?past=1 shows the last 60 days instead. Bookings and Floor plan staff can read this.
export async function GET(req: Request) {
  const u = await currentUser();
  const perms = u ? parsePermissions(u.permissions) : [];
  if (!u || !isStaffRole(u.role) || !(canAccess("bookings", u.role, perms) || canAccess("floor", u.role, perms))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const today = ukParts(new Date()).dateKey;
  const past = sp.get("past") === "1";
  const fromParam = sp.get("from") ?? "";
  const from = isRealDate(fromParam) ? fromParam : past ? addDays(today, -60) : addDays(today, -1);
  const to = past ? today : addDays(today, 120);

  const bookings = await prisma.booking.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: past ? [{ date: "desc" }, { time: "desc" }] : [{ date: "asc" }, { time: "asc" }],
    take: 2000,
  });
  return NextResponse.json({ bookings });
}
