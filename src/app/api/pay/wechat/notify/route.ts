import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { printOrderById } from "@/server/print";
import { decryptResource, parsePaymentResult, verifyNotifySignature, type EncryptedResource } from "@/server/wechat-notify";

// WeChat calls this after a customer pays. We ONLY trust it if the RSA signature
// verifies against WeChat's public key, then we decrypt, check the amount against
// OUR stored order total, and mark the order paid (idempotent).
const ok = () => NextResponse.json({ code: "SUCCESS", message: "OK" });
const fail = (status: number, message: string) => NextResponse.json({ code: "FAIL", message }, { status });

export async function POST(req: Request) {
  const apiV3Key = process.env.WECHAT_API_V3_KEY;
  const publicKey = process.env.WECHAT_PLATFORM_PUBLIC_KEY?.replace(/\\n/g, "\n");
  // Never process unverified notifications: refuse if we can't verify.
  if (!apiV3Key || !publicKey) return fail(500, "WeChat Pay verification is not configured");

  const rawBody = await req.text();
  const headers = {
    timestamp: req.headers.get("wechatpay-timestamp") ?? "",
    nonce: req.headers.get("wechatpay-nonce") ?? "",
    signature: req.headers.get("wechatpay-signature") ?? "",
  };
  if (!verifyNotifySignature(headers, rawBody, publicKey)) return fail(401, "Invalid signature");

  let result;
  try {
    const envelope = JSON.parse(rawBody) as { resource?: EncryptedResource };
    if (!envelope.resource) return fail(400, "Missing resource");
    result = parsePaymentResult(decryptResource(envelope.resource, apiV3Key));
  } catch {
    return fail(400, "Could not read notification");
  }

  if (result.trade_state !== "SUCCESS") return ok(); // nothing to record (e.g. closed/unpaid)

  const order = await prisma.order.findUnique({ where: { id: result.out_trade_no } });
  if (!order) return fail(404, "Unknown order");
  if (order.paymentStatus === "paid") return ok(); // already recorded: idempotent

  // The paid amount must match what WE stored (guards against tampering/underpayment).
  const expectedPence = Math.round(order.total * 100);
  if (result.amount?.total !== expectedPence) return fail(400, "Amount mismatch");

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "paid", paymentMethod: "wechat", paidAt: new Date(), paymentRef: result.transaction_id ?? null },
  });
  void printOrderById(order.id); // paid: now send it to the kitchen printer (no-op if PrintNode unset)
  return ok();
}
