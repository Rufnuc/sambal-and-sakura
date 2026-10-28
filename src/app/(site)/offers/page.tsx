import type { Metadata } from "next";
import { BadgePercent } from "lucide-react";
import { OffersTabs } from "@/components/offers/offers-tabs";
import { getOffers, getWheelPrizes, getReferralConfig, getEffectiveMenu, getOnlineDiscount, activeOnlineDiscount, onlineDiscountMessage } from "@/server/config";
import { gbpShort } from "@/lib/format";
import type { Offer } from "@/lib/data/site";
import type { MenuItem } from "@/lib/data/menu";
import { getPromotions, publicPromotions } from "@/server/promotions";

// Rendered on every request (live, admin-editable or per-visitor content).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/offers" },
  title: "Offers & Rewards",
  description: "Current offers, the Fortune Wheel and refer-a-friend rewards - exclusive to ordering direct with Sambal & Sakura.",
};

type Tab = "offers" | "wheel" | "refer";

/** Plain summary of what an offer's code gives, from its real settings (so the card matches checkout). */
function describeCode(o: Offer, menu: MenuItem[]): string | undefined {
  if (!o.code) return undefined;
  const what = o.pctOff ? `${o.pctOff}% off` : o.amountOff ? `${gbpShort(o.amountOff)} off` : o.freeItemId ? `Free ${menu.find((m) => m.id === o.freeItemId)?.name ?? "dish"}` : null;
  if (!what) return undefined;
  return [what, o.minSpend ? `food ${gbpShort(o.minSpend)}+` : null, o.firstOrderOnly ? "first order only" : o.oncePerCustomer ? "once per customer" : null].filter(Boolean).join(" · ");
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab: Tab = tab === "wheel" || tab === "refer" ? tab : "offers";
  const [rawOffers, prizes, referral, promos, menu, od] = await Promise.all([getOffers(), getWheelPrizes(), getReferralConfig(), getPromotions(), getEffectiveMenu(), getOnlineDiscount()]);
  const online = activeOnlineDiscount(od);
  // Hidden codes stay private, and an offer whose free dish is no longer on the menu isn't advertised.
  // First-order codes are hidden while the owner has paused them for the online discount.
  const offers = rawOffers
    .filter((o) => !o.hidden && (!o.freeItemId || menu.some((m) => m.id === o.freeItemId)))
    .filter((o) => !(o.code && o.firstOrderOnly && online?.pauseFirstOrderCodes))
    .map((o) => ({ ...o, gives: describeCode(o, menu) }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {online && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-jade/10 px-4 py-3 text-sm font-medium text-jade">
          <BadgePercent className="size-5 shrink-0" /> {onlineDiscountMessage(online)} No code needed - it comes off at checkout{online.appliesTo !== "all" ? ` on ${online.appliesTo} orders` : ""}{online.minSpend > 0 ? ` when you spend ${gbpShort(online.minSpend)}+ on food` : ""}.
        </p>
      )}
      {/* A switched-off campaign's details aren't sent to the browser at all (its codes stay private). */}
      <OffersTabs offers={promos.offers.enabled ? offers : []} prizes={promos.wheel.enabled ? prizes : []} referral={referral} promotions={publicPromotions(promos)} initialTab={initialTab} />
    </div>
  );
}
