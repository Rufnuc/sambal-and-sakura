import { NextResponse } from "next/server";
import { turnstileSiteKey } from "@/server/turnstile";
import { getReferralConfig } from "@/server/config";
import { getPromotions, publicPromotions } from "@/server/promotions";
import { AUTO_FREE_ITEM } from "@/server/pricing";

// Public, non-secret settings the browser needs (e.g. the bot-check site key, which is meant to be public).
export async function GET() {
  const [r, promos] = await Promise.all([getReferralConfig(), getPromotions()]);
  return NextResponse.json({
    promotions: publicPromotions(promos), // on/off + "campaign over" message for each promotion
    freeItemOver: promos.offers.enabled ? AUTO_FREE_ITEM.minSpend : null, // basket's "spend £x more for a free gyoza"
    turnstileSiteKey: turnstileSiteKey(),
    referral: r.enabled ? { give: r.give, minSpend: r.minSpend } : null, // shown on the sign-up form / friend banner
  });
}
