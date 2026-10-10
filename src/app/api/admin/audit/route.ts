import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { adminUser } from "@/server/auth";

// Owner-only activity log: who changed what (status changes, edits, sign-ins, config saves).
export async function GET(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const entityId = sp.get("entityId")?.slice(0, 60);
  const logs = await prisma.auditLog.findMany({
    where: entityId ? { entityId } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ logs });
}
