import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";
import { pendingPoints } from "@/server/points";
import { getPromotions, rewardUsableUntil } from "@/server/promotions";
import { getLoyalty } from "@/server/config";

export async function GET() {
  const [user, l] = await Promise.all([currentUser(), getLoyalty()]);
  // What points are worth (Admin -> Promotions), for the account page and checkout.
  const loyalty = { pointsPerPound: l.pointsPerPound, redeemStep: l.redeemPoints, redeemValue: l.redeemValue, welcomePoints: l.welcomePoints };
  if (!user) return NextResponse.json({ user: null, loyalty });
  const [rewards, pending, promos] = await Promise.all([
    prisma.reward.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    pendingPoints(prisma, user.id),
    getPromotions(),
  ]);
  const now = new Date();
  // expiresAt = when it really stops working: sooner if its campaign was switched off (grace period).
  return NextResponse.json({ loyalty, user: { ...publicUser(user), pendingPoints: pending }, rewards: rewards.map((r) => {
    const until = rewardUsableUntil(r, promos);
    return { ...r, expiresAt: until, active: !r.used && until > now };
  }) });
}
