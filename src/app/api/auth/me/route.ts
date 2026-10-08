import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  const rewards = await prisma.reward.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ user: publicUser(user), rewards });
}
