import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { payTokenHash } from "@/server/orders";

// Lets the customer's QR screen learn that payment arrived. Needs the order's pay token; exposes only the paid flag.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const orderId = (sp.get("orderId") ?? "").slice(0, 20);
  const token = (sp.get("t") ?? "").slice(0, 100);
  if (!orderId || !token) return NextResponse.json({ paid: false });
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, payToken: true } });
  const ok = !!order?.payToken && order.payToken === payTokenHash(token);
  return NextResponse.json({ paid: ok && order?.paymentStatus === "paid" });
}
