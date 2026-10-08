import { createSign, randomUUID } from "node:crypto";

// WeChat Pay v3 — Native (scan-to-pay QR) order creation.
// https://pay.weixin.qq.com/docs/merchant/apis/native-payment/direct-jsons/native-prepay.html
//
// Configure in .env with your real merchant credentials (nothing is hard-coded):
//   WECHAT_APPID=wx...                official account / app id bound to the merchant
//   WECHAT_MCHID=16000...             merchant id
//   WECHAT_SERIAL_NO=XX..             your merchant API certificate serial number
//   WECHAT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
//   WECHAT_NOTIFY_URL=https://sambalandsakura.co.uk/api/pay/wechat/notify
//
// When any are missing the caller gets a clear "not configured" error and the
// customer simply pays cash instead — the rest of the site is unaffected.

export interface WeChatConfig {
  appid: string; mchid: string; serial: string; privateKey: string; notifyUrl: string;
}

// True when WeChat Pay can be offered: merchant keys present, or any non-production
// environment (so the option can be previewed locally; the QR step then explains it isn't set up).
export function wechatAvailable(): boolean {
  return getWeChatConfig() !== null || process.env.NODE_ENV !== "production";
}

export function getWeChatConfig(): WeChatConfig | null {
  const appid = process.env.WECHAT_APPID;
  const mchid = process.env.WECHAT_MCHID;
  const serial = process.env.WECHAT_SERIAL_NO;
  const privateKey = process.env.WECHAT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const notifyUrl = process.env.WECHAT_NOTIFY_URL;
  if (!appid || !mchid || !serial || !privateKey || !notifyUrl) return null;
  return { appid, mchid, serial, privateKey, notifyUrl };
}

// Build the WeChat Pay v3 Authorization header (RSA-SHA256 signature).
function authHeader(cfg: WeChatConfig, method: string, urlPath: string, body: string): string {
  const nonce = randomUUID().replace(/-/g, "").toUpperCase();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = createSign("RSA-SHA256").update(message).sign(cfg.privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonce}",` +
    `signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serial}"`;
}

export interface NativeOrderInput { orderId: string; amountPence: number; description: string }

// Creates a Native pay order and returns the `code_url` to render as a QR.
export async function createNativeOrder(
  cfg: WeChatConfig,
  { orderId, amountPence, description }: NativeOrderInput,
): Promise<{ codeUrl: string }> {
  const urlPath = "/v3/pay/transactions/native";
  const payload = {
    appid: cfg.appid,
    mchid: cfg.mchid,
    description: description.slice(0, 127),
    out_trade_no: orderId,
    notify_url: cfg.notifyUrl,
    amount: { total: Math.round(amountPence), currency: "GBP" },
  };
  const body = JSON.stringify(payload);
  const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "sambal-sakura/1.0",
      Authorization: authHeader(cfg, "POST", urlPath, body),
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.code_url) {
    throw new Error(data.message || `WeChat Pay error (${res.status})`);
  }
  return { codeUrl: data.code_url as string };
}
