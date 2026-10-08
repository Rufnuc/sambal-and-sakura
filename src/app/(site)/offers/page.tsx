import type { Metadata } from "next";
import { OffersTabs } from "@/components/offers/offers-tabs";
import { getOffers, getWheelPrizes, getReferralConfig } from "@/server/config";

export const metadata: Metadata = {
  alternates: { canonical: "/offers" },
  title: "Offers & Rewards",
  description: "Current offers, the Fortune Wheel and our refer-a-friend rewards - exclusive to ordering direct with Sambal & Sakura.",
};

type Tab = "offers" | "wheel" | "refer";

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab: Tab = tab === "wheel" || tab === "refer" ? tab : "offers";
  const [offers, prizes, referral] = await Promise.all([getOffers(), getWheelPrizes(), getReferralConfig()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <OffersTabs offers={offers} prizes={prizes} referral={referral} initialTab={initialTab} />
    </div>
  );
}
