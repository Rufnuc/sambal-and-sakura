import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";

export async function GET() {
  const u = await currentUser();
  if (!u || (u.role !== "staff" && u.role !== "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { role: "customer" },
    orderBy: { createdAt: "asc" },
    include: { orders: { select: { total: true, status: true } } },
  });

  const customers = users.map((usr) => {
    const paid = usr.orders.filter((o) => o.status !== "cancelled");
    return {
      id: usr.id, name: usr.name, email: usr.email, phone: usr.phone,
      points: usr.points, createdAt: usr.createdAt,
      orders: paid.length,
      spend: Math.round(paid.reduce((s, o) => s + o.total, 0) * 100) / 100,
    };
  });

  return NextResponse.json({ customers });
}
