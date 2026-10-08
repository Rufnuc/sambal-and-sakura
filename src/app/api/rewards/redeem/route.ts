import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";

const REDEEM_STEP = 100;
const REDEEM_VALUE = 5;

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.points < REDEEM_STEP) return NextResponse.json({ error: "Not enough points." }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: user.id }, data: { points: { decrement: REDEEM_STEP } } });
    const reward = await tx.reward.create({
      data: {
        userId: user.id,
        label: `£${REDEEM_VALUE.toFixed(2)} off`,
        code: "PTS" + Math.random().toString(36).slice(2, 6).toUpperCase(),
        kind: "voucher", amount: REDEEM_VALUE, source: "loyalty",
        expiresAt: new Date(Date.now() + 60 * 86400000),
      },
    });
    return { updated, reward };
  });

  return NextResponse.json({ user: publicUser(result.updated), reward: result.reward });
}
