import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";

async function guard() {
  const u = await currentUser();
  if (!u || (u.role !== "staff" && u.role !== "admin")) return null;
  return u;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const orders = await prisma.order.findMany({
    include: { lines: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ orders });
}
