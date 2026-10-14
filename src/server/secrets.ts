import { createHmac, timingSafeEqual } from "node:crypto";

// Server-side signing key. Render generates SESSION_SECRET for us (render.yaml). Used for blocked-email
// fingerprints and unsubscribe links, so DON'T change it once live: old links and blocks would stop
// matching. Locally a fixed development value is fine.
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return "dev-only-secret-not-for-production";
}

/** Keyed one-way fingerprint, e.g. hmac("email", "a@b.com"). */
export function hmac(purpose: string, value: string): string {
  return createHmac("sha256", secret()).update(`${purpose}:${value}`).digest("hex");
}

export function hmacEquals(purpose: string, value: string, given: string): boolean {
  const expected = Buffer.from(hmac(purpose, value));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
