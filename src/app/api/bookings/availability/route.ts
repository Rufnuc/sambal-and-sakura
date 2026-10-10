import { NextResponse } from "next/server";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { getAvailability } from "@/server/bookings";

export async function GET(req: Request) {
  const limited = await limitOr429([{ name: "availability-ip", id: clientIp(req), limit: 120, windowSec: 600 }]);
  if (limited) return limited;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const party = Math.max(1, Math.min(20, Number(url.searchParams.get("party")) || 2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ slots: [] });
  const slots = await getAvailability(date, party);
  return NextResponse.json({ slots });
}
