import type { Metadata } from "next";
import { OffersTabs } from "@/components/offers/offers-tabs";
import { getOffers, getWheelPrizes, getReferralConfig, getEffectiveMenu } from "@/server/config";
import { gbpShort } from "@/lib/format";
import type { Offer } from "@/lib/data/site";
import type { MenuItem } from "@/lib/data/menu";
import { getPromotions, publicPromotions } from "@/server/promotions";

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
  const [rawOffers, prizes, referral, promos, menu] = await Promise.all([getOffers(), getWheelPrizes(), getReferralConfig(), getPromotions(), getEffectiveMenu()]);
  const offers = rawOffers.filter((o) => !o.hidden).map((o) => ({ ...o, gives: describeCode(o, menu) })); // hidden codes stay private

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      {/* A switched-off campaign's details aren't sent to the browser at all (its codes stay private). */}
      <OffersTabs offers={promos.offers.enabled ? offers : []} prizes={promos.wheel.enabled ? prizes : []} referral={referral} promotions={publicPromotions(promos)} initialTab={initialTab} />
    </div>
  );
}
