import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

// Lets the customer's QR screen learn that payment arrived. Exposes only the paid flag.
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId") ?? "";
  if (!orderId) return NextResponse.json({ paid: false });
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } });
  return NextResponse.json({ paid: order?.paymentStatus === "paid" });
}
