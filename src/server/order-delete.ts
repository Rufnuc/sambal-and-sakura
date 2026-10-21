import { prisma } from "@/server/db";
import { reverseOrderPoints } from "@/server/points";
import { audit } from "@/server/audit";

// Owner-only: remove a test order, as if it was never placed. Real paid orders are refused (they're
// payment and accounting records). Everything the order gave or used is put back first:
// - its loyalty points are taken back; the points history (earned, then reversed) is kept, so the
//   customer's balance still adds up;
// - any voucher it used is returned, and its "one per customer / first order" claim is released;
// - a referral it completed goes back to waiting for the friend's real first order, with the referrer's
//   reward removed - unless the referrer already spent it (then the referral stays paid, so it can't pay
//   twice). A referral the order voided (e.g. a self-referral) stays void.
// The audit entry is written in the same transaction, so an order can't disappear without a record.

export class DeleteOrderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type AuditInfo = { actor: Parameters<typeof audit>[0]["actor"]; ip?: string | null };

export async function deleteTestOrder(id: string, who: AuditInfo) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, select: { id: true, userId: true, paymentStatus: true, total: true, fulfilment: true, status: true, createdAt: true } });
    if (!order) throw new DeleteOrderError("That order doesn't exist (it may already be deleted).", 404);
    if (order.paymentStatus === "paid") throw new DeleteOrderError("This order was paid online, so it's a real payment record and can't be deleted. Cancel and refund it instead.");

    await reverseOrderPoints(tx, order.id, order.userId);
    const points = await tx.pointsEntry.count({ where: { orderId: order.id } });
    const vouchers = await tx.reward.updateMany({ where: { orderId: order.id }, data: { used: false, usedAt: null, orderId: null } });
    const claims = await tx.voucherRedemption.deleteMany({ where: { orderId: order.id } });

    let referralReset = false, referrerRewardKept = false;
    for (const ref of await tx.referral.findMany({ where: { orderId: order.id } })) {
      if (ref.status !== "rewarded") continue; // voided by this order (e.g. self-referral): leave it void
      const reward = ref.rewardId ? await tx.reward.findUnique({ where: { id: ref.rewardId } }) : null;
      if (reward?.used) { referrerRewardKept = true; continue; } // already spent: stays paid, never pays twice
      if (reward) await tx.reward.delete({ where: { id: reward.id } });
      await tx.referral.update({ where: { id: ref.id }, data: { status: "pending", orderId: null, rewardId: null, rewardedAt: null } });
      referralReset = true;
    }

    await tx.order.delete({ where: { id: order.id } }); // its lines go with it (cascade)
    await audit({
      actor: who.actor, action: "order.deleted", entity: "order", entityId: id, ip: who.ip ?? null,
      detail: { total: order.total, fulfilment: order.fulfilment, status: order.status, placedAt: order.createdAt, pointsEntries: points, vouchersReturned: vouchers.count, offerClaimsReleased: claims.count, referralReset, referrerRewardKept },
    }, tx);
    return { order, referrerRewardKept };
  });
}
