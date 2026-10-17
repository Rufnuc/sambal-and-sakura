import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { isUniqueViolation } from "@/server/ids";
import { log } from "@/server/log";

/**
 * The caller's IP address, from headers our hosting sets (never the left-most X-Forwarded-For
 * value alone, which the client can forge).
 *
 * Order of trust:
 *   1. CLIENT_IP_HEADER (if you set it) - e.g. "cf-connecting-ip" once you've confirmed it on Render
 *   2. cf-connecting-ip - set by Cloudflare, which sits in front of Render
 *   3. the right-most X-Forwarded-For entry - the one the nearest proxy appended
 * Admin → Settings → "Connection check" shows what the server actually receives, so you can confirm.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const configured = process.env.CLIENT_IP_HEADER?.toLowerCase();
  if (configured) {
    const v = h.get(configured)?.split(",")[0]?.trim();
    if (v) return v;
  }
  // Render's own edge (Cloudflare) sets cf-connecting-ip and refuses requests where a visitor tries to
  // fake it (checked live 17 Oct 2026: 403 on both the custom domain and *.onrender.com). If the site
  // ever moves to a host that does NOT do this, set CLIENT_IP_HEADER to that host's real-IP header,
  // or this line would let anyone choose their own IP and reset every per-IP limit.
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (xff.length) return xff[xff.length - 1];
  return h.get("x-real-ip")?.trim() || "local";
}

export interface LimitResult { ok: boolean; retryAfterSec: number; count: number }

/**
 * Fixed-window counter stored in the database (survives restarts and deploys).
 * `id` is what's being limited (an IP, a phone number, a user id...).
 */
export async function hit(name: string, id: string, limit: number, windowSec: number): Promise<LimitResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = `${name}:${id}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowMs);
  const retryAfterSec = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000));
  let count: number;
  try {
    count = (await prisma.rateLimit.upsert({
      where: { key }, create: { key, count: 1, expiresAt }, update: { count: { increment: 1 } }, select: { count: true },
    })).count;
  } catch (e) {
    if (!isUniqueViolation(e)) {
      // Never let the limiter itself take the site down: fail open, but log it.
      log.error("rate_limit_error", { name });
      return { ok: true, retryAfterSec: 0, count: 0 };
    }
    // Two requests created the row at the same instant: the loser just increments.
    count = (await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } }, select: { count: true } })).count;
  }
  return { ok: count <= limit, retryAfterSec, count };
}

export interface LimitRule { name: string; id: string | null | undefined; limit: number; windowSec: number }

/**
 * Check several limits; returns a ready 429 response if any is exceeded, otherwise null.
 * Rules with an empty id are skipped (e.g. no phone given).
 */
export async function limitOr429(rules: LimitRule[], message = "Too many attempts. Please wait a little and try again."): Promise<NextResponse | null> {
  for (const r of rules) {
    if (!r.id) continue;
    const res = await hit(r.name, r.id, r.limit, r.windowSec);
    if (!res.ok) {
      log.warn("rate_limited", { rule: r.name, count: res.count });
      return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(res.retryAfterSec) } });
    }
  }
  return null;
}
