import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { getWheelPrizes } from "@/server/config";
import type { WheelPrize } from "@/lib/data/site";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function weightedPick(prizes: WheelPrize[]) {
  const total = prizes.reduce((n, p) => n + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) { r -= p.weight; if (r <= 0) return p; }
  return prizes[prizes.length - 1];
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in to spin." }, { status: 401 });

  const key = `wheel:${user.id}`;
  const last = await prisma.setting.findUnique({ where: { key } });
  const lastTs = last ? Number(last.value) : 0;
  if (lastTs && Date.now() - lastTs < COOLDOWN_MS) {
    const daysLeft = Math.ceil((lastTs + COOLDOWN_MS - Date.now()) / 86400000);
    return NextResponse.json({ error: `One spin a week - come back in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`, cooldown: true, daysLeft }, { status: 429 });
  }

  const prizes = await getWheelPrizes();
  const prize = weightedPick(prizes);
  const now = Date.now();
  await prisma.setting.upsert({ where: { key }, update: { value: String(now) }, create: { key, value: String(now) } });

  let reward = null;
  if (prize.kind !== "none") {
    const amount = prize.kind === "percent" ? (prize.id === "p15" ? 15 : 10) : prize.kind === "voucher" ? 5 : undefined;
    reward = await prisma.reward.create({
      data: {
        userId: user.id, label: prize.label,
        code: "FC" + Math.random().toString(36).slice(2, 6).toUpperCase(),
        kind: prize.kind, amount, source: "wheel",
        expiresAt: new Date(now + COOLDOWN_MS),
      },
    });
  }

  // prizeIndex lets the client animate to the server-decided segment.
  const prizeIndex = prizes.findIndex((p) => p.id === prize.id);
  return NextResponse.json({ prize: { id: prize.id, label: prize.label, kind: prize.kind }, prizeIndex, reward });
}
