import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

// The host's health check calls this every few seconds. By default it only confirms the app is
// running and does NOT touch the database, so a sleeping (free-tier) database can stay asleep.
// /api/health?db=1 also checks the database (for you, or an uptime monitor, now and then).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("db") !== "1") return NextResponse.json({ ok: true });
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
