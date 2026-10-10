import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { getWheelPrizes } from "@/server/config";
import { rewardCode, isUniqueViolation, withFreshIds } from "@/server/ids";
import { log } from "@/server/log";
import type { WheelPrize } from "@/lib/data/site";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function weightedPick(prizes: WheelPrize[]) {
  const live = prizes.filter((p) => p.weight > 0);
  const total = live.reduce((n, p) => n + p.weight, 0);
  let r = randomInt(Math.max(1, Math.round(total * 1000))) / 1000;
  for (const p of live) { r -= p.weight; if (r < 0) return p; }
  return live[live.length - 1] ?? prizes[prizes.length - 1];
}

/** The reward value comes from the prize itself (set in Admin → Promotions), so the label and value always match. */
function prizeAmount(p: WheelPrize): number | undefined {
  if (typeof p.amount === "number" && p.amount > 0) return p.amount;
  // Older saved prizes without an amount: read it from the label ("15% off", "£5 next order").
  const m = /(\d+(?:\.\d+)?)/.exec(p.label);
  if (p.kind === "percent") return m ? Math.min(50, Number(m[1])) : 10;
  if (p.kind === "voucher") return m ? Math.min(50, Number(m[1])) : 5;
  return undefined;
}

/** Atomically claim this week's spin. Returns false if the customer has already spun in the last 7 days. */
async function claimSpin(userId: string): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - COOLDOWN_MS);
  const claimed = await prisma.wheelState.updateMany({ where: { userId, lastSpinAt: { lt: cutoff } }, data: { lastSpinAt: now } });
  if (claimed.count === 1) return true;
  try {
    await prisma.wheelState.create({ data: { userId, lastSpinAt: now } }); // first ever spin
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // row exists and is inside the cooldown (or a parallel spin won)
    throw e;
  }
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to spin." }, { status: 401 });

  // Spins unlock with a real order, so creating accounts alone earns nothing.
  const ordered = await prisma.order.count({ where: { userId: user.id, status: { not: "cancelled" } } });
  if (ordered === 0) return NextResponse.json({ error: "Place your first order to unlock your weekly spin.", needsOrder: true }, { status: 403 });

  if (!(await claimSpin(user.id))) {
    const state = await prisma.wheelState.findUnique({ where: { userId: user.id } });
    const next = (state?.lastSpinAt.getTime() ?? Date.now()) + COOLDOWN_MS;
    const daysLeft = Math.max(1, Math.ceil((next - Date.now()) / 86400000));
    return NextResponse.json({ error: `One spin a week - come back in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`, cooldown: true, daysLeft }, { status: 429 });
  }

  const prizes = await getWheelPrizes();
  const prize = weightedPick(prizes);

  let reward = null;
  if (prize.kind !== "none") {
    reward = await withFreshIds(() => prisma.reward.create({
      data: {
        userId: user.id, label: prize.label,
        code: rewardCode("FC"),
        kind: prize.kind, amount: prizeAmount(prize), source: "wheel",
        expiresAt: new Date(Date.now() + COOLDOWN_MS),
      },
    }), ["code"]);
  }
  log.info("wheel_spin", { userId: user.id, prize: prize.id });

  // prizeIndex lets the client animate to the server-decided segment.
  const prizeIndex = prizes.findIndex((p) => p.id === prize.id);
  return NextResponse.json({ prize: { id: prize.id, label: prize.label, kind: prize.kind }, prizeIndex, reward });
}
