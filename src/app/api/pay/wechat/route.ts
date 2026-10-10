import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getWeChatConfig, createNativeOrder } from "@/server/wechat";
import { payTokenHash } from "@/server/orders";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { log, errInfo } from "@/server/log";

// Creates a WeChat Pay Native order for an existing order and returns a code_url (rendered as a QR).
// Only the browser that placed the order can start its payment (it holds the one-time pay token),
// only for unpaid WeChat orders. The amount always comes from the stored order, never the client.
export async function POST(req: Request) {
  const cfg = getWeChatConfig();
  if (!cfg) {
    return NextResponse.json({ error: "WeChat Pay isn't set up yet. Please pay cash, or ask staff to add the merchant keys." }, { status: 503 });
  }
  const limited = await limitOr429([{ name: "wechat-start", id: clientIp(req), limit: 20, windowSec: 600 }]);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId.slice(0, 20) : "";
  const token = typeof body?.payToken === "string" ? body.payToken.slice(0, 100) : "";
  if (!orderId || !token) return NextResponse.json({ error: "Missing order." }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.payToken || order.payToken !== payTokenHash(token)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.paymentMethod !== "wechat") return NextResponse.json({ error: "This order is set to pay in cash." }, { status: 400 });
  if (order.paymentStatus === "paid") return NextResponse.json({ error: "This order is already paid." }, { status: 400 });
  if (order.status === "cancelled") return NextResponse.json({ error: "Order was cancelled." }, { status: 400 });

  try {
    const { codeUrl } = await createNativeOrder(cfg, {
      orderId: order.id,
      amountPence: Math.round(order.total * 100),
      description: `Sambal & Sakura order ${order.id}`,
    });
    return NextResponse.json({ codeUrl });
  } catch (e) {
    log.error("wechat_create_failed", { orderId: order.id, ...errInfo(e) }); // full detail in the logs only
    return NextResponse.json({ error: "Could not start WeChat payment. Please try again or pay cash." }, { status: 502 });
  }
}
