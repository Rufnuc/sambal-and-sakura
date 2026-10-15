import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";
import { pendingPoints } from "@/server/points";
import { getPromotions, rewardUsableUntil } from "@/server/promotions";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  const [rewards, pending, promos] = await Promise.all([
    prisma.reward.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    pendingPoints(prisma, user.id),
    getPromotions(),
  ]);
  const now = new Date();
  // expiresAt = when it really stops working: sooner if its campaign was switched off (grace period).
  return NextResponse.json({ user: { ...publicUser(user), pendingPoints: pending }, rewards: rewards.map((r) => {
    const until = rewardUsableUntil(r, promos);
    return { ...r, expiresAt: until, active: !r.used && until > now };
  }) });
}
