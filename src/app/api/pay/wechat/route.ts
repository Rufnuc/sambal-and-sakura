import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getWeChatConfig, createNativeOrder } from "@/server/wechat";

// Creates a WeChat Pay Native order for an existing order and returns a code_url
// (rendered as a QR on the client). Amount is read from the trusted DB order,
// never from the client.
export async function POST(req: Request) {
  const cfg = getWeChatConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "WeChat Pay isn't set up yet. Please pay cash, or ask staff to add the merchant keys." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : null;
  if (!orderId) return NextResponse.json({ error: "Missing order." }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status === "cancelled") return NextResponse.json({ error: "Order was cancelled." }, { status: 400 });

  try {
    const { codeUrl } = await createNativeOrder(cfg, {
      orderId: order.id,
      amountPence: Math.round(order.total * 100),
      description: `Sambal & Sakura order ${order.id}`,
    });
    return NextResponse.json({ codeUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not start WeChat payment." }, { status: 502 });
  }
}
