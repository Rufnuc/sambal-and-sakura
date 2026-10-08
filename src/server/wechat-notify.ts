import { createVerify, createDecipheriv } from "node:crypto";

// WeChat Pay v3 payment notification: signature verification + payload decryption.
// Kept free of app imports so it can be unit-tested in isolation.
// Docs: https://pay.weixin.qq.com/docs/merchant/apis/native-payment/payment-notice.html
//
// Needs (set in .env / Render):
//   WECHAT_API_V3_KEY            32-character APIv3 key from the merchant platform
//   WECHAT_PLATFORM_PUBLIC_KEY   WeChat's public key (PEM) used to verify notification signatures

export interface NotifyHeaders {
  timestamp: string; nonce: string; signature: string;
}

const MAX_SKEW_SECONDS = 5 * 60; // reject replayed / stale notifications

export function verifyNotifySignature(
  { timestamp, nonce, signature }: NotifyHeaders,
  rawBody: string,
  platformPublicKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
    return verifier.verify(platformPublicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}

export interface EncryptedResource {
  algorithm: string; ciphertext: string; associated_data?: string; nonce: string;
}

// AEAD_AES_256_GCM: the last 16 bytes of the ciphertext are the auth tag.
export function decryptResource(resource: EncryptedResource, apiV3Key: string): string {
  if (resource.algorithm !== "AEAD_AES_256_GCM") throw new Error("Unsupported algorithm");
  const key = Buffer.from(apiV3Key, "utf8");
  if (key.length !== 32) throw new Error("WECHAT_API_V3_KEY must be 32 characters");
  const data = Buffer.from(resource.ciphertext, "base64");
  const tag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce, "utf8"));
  decipher.setAuthTag(tag);
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export interface PaymentResult {
  out_trade_no: string;
  transaction_id?: string;
  trade_state: string; // SUCCESS | REFUND | NOTPAY | CLOSED | ...
  amount?: { total: number; payer_total?: number; currency?: string };
}

export function parsePaymentResult(plaintext: string): PaymentResult {
  const r = JSON.parse(plaintext) as PaymentResult;
  if (!r || typeof r.out_trade_no !== "string" || typeof r.trade_state !== "string") throw new Error("Malformed payment result");
  return r;
}
