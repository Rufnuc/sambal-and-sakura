import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { staffFor } from "@/server/auth";

const PAGE = 50;

// Customer list for staff with Customers access. Paginated and searchable; order counts and spend
// are aggregated by the database instead of loading every order of every customer.
export async function GET(req: Request) {
  if (!(await staffFor("customers"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const where = {
    role: "customer",
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }, { phone: { contains: q.replace(/\s/g, "") } }] } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * PAGE, take: PAGE, select: { id: true, name: true, email: true, phone: true, points: true, createdAt: true } }),
  ]);
  const stats = users.length
    ? await prisma.order.groupBy({ by: ["userId"], where: { userId: { in: users.map((x) => x.id) }, status: { not: "cancelled" } }, _count: true, _sum: { total: true } })
    : [];
  const byUser = new Map(stats.map((s) => [s.userId, s]));

  const customers = users.map((usr) => {
    const s = byUser.get(usr.id);
    return { ...usr, orders: s?._count ?? 0, spend: Math.round((s?._sum.total ?? 0) * 100) / 100 };
  });
  return NextResponse.json({ customers, total, page, pageSize: PAGE });
}
