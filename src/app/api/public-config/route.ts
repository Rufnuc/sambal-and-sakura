import { NextResponse } from "next/server";
import { turnstileSiteKey } from "@/server/turnstile";
import { getReferralConfig, getDeliveryRules, getZones, getEffectiveMenu, getOnlineDiscount, activeOnlineDiscount, onlineDiscountMessage } from "@/server/config";
import { getPromotions, publicPromotions } from "@/server/promotions";
import { AUTO_FREE_ITEM } from "@/server/pricing";

// Public, non-secret settings the browser needs (e.g. the bot-check site key, which is meant to be public).
export async function GET() {
  const [r, promos, delivery, zones, menu, od] = await Promise.all([getReferralConfig(), getPromotions(), getDeliveryRules(), getZones(), getEffectiveMenu(), getOnlineDiscount()]);
  const online = activeOnlineDiscount(od);
  // Only promise the free dish over a spend while that dish is actually on the menu (and not sold out).
  const freeItemOn = !!AUTO_FREE_ITEM && menu.some((m) => m.id === AUTO_FREE_ITEM!.itemId && !m.soldOut);
  return NextResponse.json({
    promotions: publicPromotions(promos), // on/off + "campaign over" message for each promotion
    freeItemOver: promos.offers.enabled && freeItemOn ? AUTO_FREE_ITEM!.minSpend : null, // basket's "spend £x more for a free gyoza"
    turnstileSiteKey: turnstileSiteKey(),
    // Basket/checkout hints: "Delivery from £x · free on £y+" (null = no free delivery).
    delivery: { minOrder: delivery.minOrder, freeOver: delivery.freeDeliveryOver, fromFee: zones.length ? Math.min(...zones.map((z) => z.fee)) : null },
    // "Order direct on our website and save 10%" for the basket (null = paused or deleted).
    onlineDiscount: online ? { pctOff: online.pctOff, message: onlineDiscountMessage(online), appliesTo: online.appliesTo, minSpend: online.minSpend } : null,
    referral: r.enabled ? { give: r.give, minSpend: r.minSpend } : null, // shown on the sign-up form / friend banner
  });
}
