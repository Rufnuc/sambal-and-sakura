import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getSiteContent } from "@/server/site-content";
import { getCancelPolicy, customerCanCancel, validTrackToken } from "@/server/cancellations";
import { clientIp, limitOr429 } from "@/server/rate-limit";

// Live status for the customer's tracking page. Needs the signed link from their email, and never
// returns the address or phone number (the link could be forwarded).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limitOr429([{ name: "track-ip", id: clientIp(req), limit: 240, windowSec: 600 }]);
  if (limited) return limited;
  const { id } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!validTrackToken(id, t)) return NextResponse.json({ error: "This tracking link isn't valid." }, { status: 404 });
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const [{ business }, policy] = await Promise.all([getSiteContent(), getCancelPolicy()]);
  const cancel = await customerCanCancel(o, policy, business.phone);
  return NextResponse.json({
    order: {
      id: o.id, status: o.status, fulfilment: o.fulfilment, whenType: o.whenType, scheduledTime: o.scheduledTime,
      createdAt: o.createdAt, etaMins: o.etaMins, firstName: o.customerName.split(" ")[0],
      lines: o.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
      subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total,
      onlineDiscount: o.onlineDiscount, onlineDiscountLabel: o.onlineDiscountLabel, voucherCode: o.voucherCode,
      balanceDiscount: o.balanceDiscount, balancePaid: o.balancePaid,
      // Only while it's still needed: the customer gives it at the door / counter.
      handoverCode: ["completed", "cancelled"].includes(o.status) ? null : o.handoverCode,
      paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
      cancelKind: o.cancelKind, cancelReason: o.cancelKind === "customer" ? o.cancelReason?.replace(/^Customer: /, "") : null,
    },
    cancel,
    restaurant: { phone: business.phone, address: `${business.address.line1}, ${business.address.city} ${business.address.postcode}` },
    serverTime: Date.now(),
  });
}
