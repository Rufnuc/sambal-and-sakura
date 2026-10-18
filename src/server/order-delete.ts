import { prisma } from "@/server/db";
import { reverseOrderPoints } from "@/server/points";

// Owner-only: remove a test order completely, as if it was never placed. Real paid orders are refused
// (they're payment and accounting records). Everything the order gave or used is put back first:
// its loyalty points are taken back, any voucher it used is returned, and a referral it completed or
// voided goes back to waiting for the friend's real first order (the referrer's reward from it is
// removed unless they've already spent it).

export class DeleteOrderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function deleteTestOrder(id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, select: { id: true, userId: true, paymentStatus: true, total: true, fulfilment: true, status: true, createdAt: true } });
    if (!order) throw new DeleteOrderError("That order doesn't exist (it may already be deleted).", 404);
    if (order.paymentStatus === "paid") throw new DeleteOrderError("This order was paid online, so it's a real payment record and can't be deleted. Cancel and refund it instead.");

    await reverseOrderPoints(tx, order.id, order.userId);
    const points = await tx.pointsEntry.deleteMany({ where: { orderId: order.id } });
    const vouchers = await tx.reward.updateMany({ where: { orderId: order.id }, data: { used: false, usedAt: null, orderId: null } });

    let referralReset = false, referrerRewardKept = false;
    for (const ref of await tx.referral.findMany({ where: { orderId: order.id } })) {
      if (ref.rewardId) {
        const reward = await tx.reward.findUnique({ where: { id: ref.rewardId } });
        if (reward && !reward.used) await tx.reward.delete({ where: { id: reward.id } });
        else if (reward) referrerRewardKept = true;
      }
      await tx.referral.update({ where: { id: ref.id }, data: { status: "pending", orderId: null, rewardId: null, rewardedAt: null, voidReason: null } });
      referralReset = true;
    }

    await tx.order.delete({ where: { id: order.id } }); // its lines go with it (cascade)
    return { order, pointsEntries: points.count, vouchersReturned: vouchers.count, referralReset, referrerRewardKept };
  });
}
