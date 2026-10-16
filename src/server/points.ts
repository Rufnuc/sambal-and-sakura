import type { Prisma } from "@prisma/client";

// Loyalty ledger rules:
//  - Points from an order (and the sign-up bonus) are PENDING until staff mark an order completed.
//  - Pending points can't be spent. Cancelling an order reverses its pending points.
//  - User.points is the confirmed, spendable balance and is only changed with guarded writes,
//    so two requests at the same moment can never spend the same points twice.

type Tx = Prisma.TransactionClient;

export const WELCOME_POINTS = 50;
// Redeeming: this many confirmed points -> a £REDEEM_VALUE voucher, usable for REDEEM_DAYS days.
export const REDEEM_STEP = 100;
export const REDEEM_VALUE = 5;
export const REDEEM_DAYS = 60;

export async function addPendingOrderPoints(tx: Tx, userId: string, orderId: string, points: number) {
  if (points <= 0) return;
  await tx.pointsEntry.create({ data: { userId, orderId, delta: points, reason: "order", status: "pending" } });
}

/** Order completed: confirm its points, plus the sign-up bonus if it is still pending. */
export async function confirmOrderPoints(tx: Tx, orderId: string, userId: string | null) {
  if (!userId) return;
  const pending = await tx.pointsEntry.findMany({
    where: { userId, status: "pending", OR: [{ orderId }, { reason: "welcome" }] },
  });
  for (const e of pending) {
    // Guarded: only one request can flip a given entry from pending to confirmed.
    const flipped = await tx.pointsEntry.updateMany({ where: { id: e.id, status: "pending" }, data: { status: "confirmed" } });
    if (flipped.count === 1) await tx.user.update({ where: { id: userId }, data: { points: { increment: e.delta } } });
  }
}

/** Order cancelled: reverse its points (pending ones simply void; confirmed ones are taken back, never below 0). */
export async function reverseOrderPoints(tx: Tx, orderId: string, userId: string | null) {
  if (!userId) return;
  const entries = await tx.pointsEntry.findMany({ where: { userId, orderId, reason: "order", status: { in: ["pending", "confirmed"] } } });
  for (const e of entries) {
    const flipped = await tx.pointsEntry.updateMany({ where: { id: e.id, status: e.status }, data: { status: "reversed" } });
    if (flipped.count !== 1 || e.status !== "confirmed") continue;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { points: true } });
    const take = Math.min(e.delta, user?.points ?? 0);
    if (take > 0) {
      await tx.user.updateMany({ where: { id: userId, points: { gte: take } }, data: { points: { decrement: take } } });
      await tx.pointsEntry.create({ data: { userId, orderId, delta: -take, reason: "reversal", status: "confirmed" } });
    }
  }
}

/** Spend points atomically. Returns false (and changes nothing) if the balance isn't enough. */
export async function spendPoints(tx: Tx, userId: string, points: number, reason: string): Promise<boolean> {
  const r = await tx.user.updateMany({ where: { id: userId, points: { gte: points } }, data: { points: { decrement: points } } });
  if (r.count !== 1) return false;
  await tx.pointsEntry.create({ data: { userId, delta: -points, reason, status: "confirmed" } });
  return true;
}

export async function pendingPoints(tx: Tx, userId: string): Promise<number> {
  const agg = await tx.pointsEntry.aggregate({ where: { userId, status: "pending" }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}
