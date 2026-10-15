import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { adminUser } from "@/server/auth";
import { clientIp } from "@/server/rate-limit";
import { zId, zText } from "@/server/sanitize";
import { voidReferral } from "@/server/referrals";

// Owner only: every referral (latest first) and a way to void one that looks like abuse.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await prisma.referral.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { referrer: { select: { name: true, email: true } }, referee: { select: { name: true, email: true } } },
  });
  return NextResponse.json({
    referrals: rows.map((r) => ({
      id: r.id, code: r.code, status: r.status, orderId: r.orderId, voidReason: r.voidReason,
      createdAt: r.createdAt, rewardedAt: r.rewardedAt,
      referrer: r.referrer, referee: r.referee,
    })),
  });
}

const voidSchema = z.object({ id: zId(40), action: z.literal("void"), reason: zText(200).optional() });

export async function POST(req: Request) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = voidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ok = await voidReferral(parsed.data.id, { id: admin.id, email: admin.email }, parsed.data.reason ?? "", clientIp(req));
  if (!ok) return NextResponse.json({ error: "That referral doesn't exist or is already void." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
