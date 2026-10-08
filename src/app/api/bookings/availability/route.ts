import { NextResponse } from "next/server";
import { getAvailability } from "@/server/bookings";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const party = Math.max(1, Math.min(20, Number(url.searchParams.get("party")) || 2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ slots: [] });
  const slots = await getAvailability(date, party);
  return NextResponse.json({ slots });
}
