import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { staffFor } from "@/server/auth";

// Event counts for the Analytics screen (real data from all consenting visitors, not one browser).
export async function GET(req: Request) {
  if (!(await staffFor("analytics"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14));
  const since = new Date(Date.now() - days * 86400000);
  const [counts, recent] = await Promise.all([
    prisma.event.groupBy({ by: ["name"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.event.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { name: true, createdAt: true } }),
  ]);
  return NextResponse.json({ days, counts: Object.fromEntries(counts.map((c) => [c.name, c._count])), recent });
}
