import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, isStaffRole } from "@/server/auth";
import { canAccess, parsePermissions } from "@/lib/admin/sections";
import { ukParts, addDays, isRealDate } from "@/server/order-time";
import { cleanQuery, nameVariants } from "@/server/sanitize";
import { phoneKey } from "@/server/phone";

// Bookings from yesterday onwards by default (upcoming reservations are never cut off by old ones).
// ?past=1 shows the last 60 days instead. ?q= searches ALL bookings (any date) by name, phone, email
// or booking reference. Bookings and Floor plan staff can read this.
export async function GET(req: Request) {
  const u = await currentUser();
  const perms = u ? parsePermissions(u.permissions) : [];
  if (!u || !isStaffRole(u.role) || !(canAccess("bookings", u.role, perms) || canAccess("floor", u.role, perms))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const q = cleanQuery(sp.get("q"));
  if (q) {
    const bookings = await prisma.booking.findMany({
      where: { OR: [
        { id: { contains: q.toUpperCase() } },
        ...(phoneKey(q).length >= 3 ? [{ phone: { contains: phoneKey(q) } }] : []),
        ...nameVariants(q).map((n) => ({ name: { contains: n } })),
        { email: { contains: q.toLowerCase() } },
      ] },
      orderBy: [{ date: "desc" }, { time: "desc" }],
      take: 200,
    });
    return NextResponse.json({ bookings });
  }
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
