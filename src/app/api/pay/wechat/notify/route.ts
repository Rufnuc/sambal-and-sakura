import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { printNewOrder } from "@/server/print";
import { decryptResource, parsePaymentResult, verifyNotifySignature, type EncryptedResource } from "@/server/wechat-notify";
import { audit } from "@/server/audit";
import { log, alertOwner } from "@/server/log";
import { noteOrderActivity } from "@/server/activity";

// WeChat calls this after a customer pays. We ONLY trust it if the RSA signature verifies against
// WeChat's public key, then we decrypt, check the amount against OUR stored order total, and mark
// the order paid. Safe to receive more than once (WeChat retries): only the first one prints.
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
  if (!verifyNotifySignature(headers, rawBody, publicKey)) {
    log.warn("wechat_notify_bad_signature", {});
    return fail(401, "Invalid signature");
  }

  let result;
  try {
    const envelope = JSON.parse(rawBody) as { resource?: EncryptedResource };
    if (!envelope.resource) return fail(400, "Missing resource");
    result = parsePaymentResult(decryptResource(envelope.resource, apiV3Key));
  } catch {
    log.error("wechat_notify_unreadable", {});
    return fail(400, "Could not read notification");
  }

  if (result.trade_state !== "SUCCESS") return ok(); // nothing to record (e.g. closed/unpaid)

  const order = await prisma.order.findUnique({ where: { id: result.out_trade_no } });
  if (!order) {
    void alertOwner(`wechat-unknown:${result.out_trade_no}`, `WeChat says order ${result.out_trade_no} was paid, but it isn't in the system. Check the WeChat merchant platform.`);
    return fail(404, "Unknown order");
  }
  if (order.paymentStatus === "paid") return ok(); // already recorded

  // The paid amount must match what WE stored (guards against tampering/underpayment).
  const expectedPence = Math.round(order.total * 100);
  if (result.amount?.total !== expectedPence) {
    void alertOwner(`wechat-amount:${order.id}`, `WeChat payment for order ${order.id} doesn't match the order total (paid ${result.amount?.total ?? "?"}p, expected ${expectedPence}p). Check before preparing.`);
    return fail(400, "Amount mismatch");
  }

  // Guarded: only the first notification flips the order to paid (WeChat may send it several times at once).
  const cancelled = order.status === "cancelled";
  const flags: string[] = (() => { try { return JSON.parse(order.flags); } catch { return []; } })();
  const marked = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: "unpaid" },
    data: {
      paymentStatus: "paid", paymentMethod: "wechat", paidAt: new Date(), paymentRef: result.transaction_id ?? null,
      ...(cancelled ? { flags: JSON.stringify([...new Set([...flags, "paid-after-cancel"])]), printStatus: "not-needed" } : {}),
    },
  });
  if (marked.count !== 1) return ok(); // a parallel notification got there first
  noteOrderActivity();

  await audit({ action: "order.paid", entity: "order", entityId: order.id, detail: { method: "wechat", ref: result.transaction_id, cancelled } });
  if (cancelled) {
    // Don't send a cancelled order to the kitchen. The customer has paid, so it needs a refund.
    void alertOwner(`refund:${order.id}`, `Order ${order.id} was paid by WeChat (£${order.total.toFixed(2)}) AFTER it was cancelled. Refund it in the WeChat Pay merchant platform, or reinstate it.`);
    return ok();
  }
  void printNewOrder(order.id); // paid: now send it to the kitchen printer
  return ok();
}
