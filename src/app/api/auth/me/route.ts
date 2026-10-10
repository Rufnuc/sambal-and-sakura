import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";
import { pendingPoints } from "@/server/points";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  const [rewards, pending] = await Promise.all([
    prisma.reward.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    pendingPoints(prisma, user.id),
  ]);
  return NextResponse.json({ user: { ...publicUser(user), pendingPoints: pending }, rewards });
}
