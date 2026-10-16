import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";
import { spendPoints, REDEEM_STEP, REDEEM_VALUE, REDEEM_DAYS } from "@/server/points";
import { rewardCode, withFreshIds } from "@/server/ids";
import { limitOr429 } from "@/server/rate-limit";
import { log } from "@/server/log";


class NotEnough extends Error {}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await limitOr429([{ name: "redeem-user", id: user.id, limit: 10, windowSec: 3600 }]);
  if (limited) return limited;

  try {
    const result = await withFreshIds(() => prisma.$transaction(async (tx) => {
      // Guarded spend: the balance check and the deduction are one database write, so parallel
      // requests can never spend the same points twice (or push the balance below zero).
      if (!(await spendPoints(tx, user.id, REDEEM_STEP, "redeem"))) throw new NotEnough();
      const reward = await tx.reward.create({
        data: {
          userId: user.id,
          label: `£${REDEEM_VALUE.toFixed(2)} off`,
          code: rewardCode("PTS"),
          kind: "voucher", amount: REDEEM_VALUE, source: "loyalty",
          expiresAt: new Date(Date.now() + REDEEM_DAYS * 86400000),
        },
      });
      const updated = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      return { updated, reward };
    }), ["code"]);
    log.info("points_redeemed", { userId: user.id, points: REDEEM_STEP });
    return NextResponse.json({ user: publicUser(result.updated), reward: result.reward });
  } catch (e) {
    if (e instanceof NotEnough) return NextResponse.json({ error: "Not enough points." }, { status: 400 });
    throw e;
  }
}
