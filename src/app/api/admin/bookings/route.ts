import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";

export async function GET() {
  const u = await currentUser();
  if (!u || (u.role !== "staff" && u.role !== "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const bookings = await prisma.booking.findMany({ orderBy: [{ date: "asc" }, { time: "asc" }], take: 300 });
  return NextResponse.json({ bookings });
}
