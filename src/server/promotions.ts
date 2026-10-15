import { z } from "zod";
import type { Reward } from "@prisma/client";
import { prisma } from "@/server/db";
import { zText } from "@/server/sanitize";

// The owner's on/off switches for the three promotions on the Offers page (Admin → Promotions → Campaigns).
//
// Switched OFF means really off, not just hidden: the tab shows the owner's "campaign over" message,
// public offer codes and the automatic free item stop at checkout, spins are refused, and new referral
// codes are ignored. Rewards customers were already given (wheel prizes, referral rewards) stay usable
// for `graceDays` after the switch-off, but never past their own expiry date. Switching back on
// restores them (nothing is deleted or rewritten).

export type PromoKey = "offers" | "wheel" | "referral";
export const PROMO_KEYS: PromoKey[] = ["offers", "wheel", "referral"];
export const DEFAULT_PAUSED_MESSAGE = "Sorry, this campaign has ended for now. Keep checking back - exciting offers are on the way!";
const DAY = 86_400_000;
const KEY = "promotions";

export interface PromoState { enabled: boolean; message: string; graceDays: number; pausedAt: string | null }
export type Promotions = Record<PromoKey, PromoState>;

const DEFAULT_STATE: PromoState = { enabled: true, message: DEFAULT_PAUSED_MESSAGE, graceDays: 14, pausedAt: null };

/** What the owner can send (pausedAt is set by the server, never by the browser). */
const promoInput = z.object({
  enabled: z.boolean(),
  message: zText(240, { min: 1 }),
  graceDays: z.number().int().min(0).max(90),
}).strict();
export const promotionsSchema = z.object({ offers: promoInput, wheel: promoInput, referral: promoInput }).strict();
export type PromotionsInput = z.infer<typeof promotionsSchema>;

function merge(raw: unknown): Promotions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<PromoKey, Partial<PromoState>>>;
  return Object.fromEntries(PROMO_KEYS.map((k) => [k, { ...DEFAULT_STATE, ...(o[k] ?? {}) }])) as Promotions;
}

export async function getPromotions(): Promise<Promotions> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) {
    // Before this switch existed, referrals had their own on/off setting: carry it over.
    const ref = await prisma.setting.findUnique({ where: { key: "referral" } });
    let refOn = true;
    try { refOn = ref ? JSON.parse(ref.value).enabled !== false : true; } catch { /* default on */ }
    return merge({ referral: { enabled: refOn } });
  }
  try { return merge(JSON.parse(row.value)); } catch { return merge({}); }
}

/** Save the owner's switches. Records when each one was switched off (that's when the grace period starts). */
export async function setPromotions(input: PromotionsInput): Promise<Promotions> {
  const prev = await getPromotions();
  const now = new Date().toISOString();
  const next = Object.fromEntries(PROMO_KEYS.map((k) => {
    const was = prev[k], want = input[k];
    const pausedAt = want.enabled ? null : was.enabled ? now : was.pausedAt ?? now;
    return [k, { ...want, pausedAt }];
  })) as Promotions;
  const value = JSON.stringify(next);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return next;
}

/** Which promotion a personal reward belongs to (welcome and points rewards belong to none). */
export function promoOf(source: string): PromoKey | null {
  if (source === "wheel") return "wheel";
  if (source === "referral" || source === "referral-welcome") return "referral";
  return null;
}

/** Until when a promotion's already-issued rewards still work after it was switched off (null = it's on). */
export function graceEnds(p: PromoState): Date | null {
  if (p.enabled) return null;
  const from = p.pausedAt ? Date.parse(p.pausedAt) : Date.now();
  return new Date(from + p.graceDays * DAY);
}

/** The date a reward actually stops working: its expiry, or the end of its promotion's grace period if sooner. */
export function rewardUsableUntil(r: Pick<Reward, "source" | "expiresAt">, promos: Promotions): Date {
  const key = promoOf(r.source);
  const end = key ? graceEnds(promos[key]) : null;
  return end && end < r.expiresAt ? end : r.expiresAt;
}

/** Public view for pages: on/off and the message (no internal dates). */
export function publicPromotions(p: Promotions) {
  return Object.fromEntries(PROMO_KEYS.map((k) => [k, { enabled: p[k].enabled, message: p[k].message }])) as Record<PromoKey, { enabled: boolean; message: string }>;
}
