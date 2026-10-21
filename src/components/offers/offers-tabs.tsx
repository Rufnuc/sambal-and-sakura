"use client";

import { useState } from "react";
import Link from "next/link";
import { Ticket, FerrisWheel, Gift, BadgePercent, ShieldCheck, Share2, UserPlus, Wallet, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/copy-code";
import { SpinWheel } from "@/components/wheel/spin-wheel";
import { ReferralWidget } from "@/components/refer/referral-widget";
import type { Offer, WheelPrize } from "@/lib/data/site";
import { cn } from "@/lib/utils";
import { gbpShort } from "@/lib/format";

const KIND_ICON: Record<string, React.ElementType> = { "first-order": UserPlus, bundle: Ticket, freebie: Gift, percent: BadgePercent };
const STEP_ICONS = [Share2, UserPlus, Wallet];

type Tab = "offers" | "wheel" | "refer";
type Promo = { enabled: boolean; message: string };

/** Shown in place of a promotion the owner has switched off. */
function CampaignOver({ message }: { message: string }) {
  return (
    <div role="status" className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-full bg-gold/15 text-gold-ink"><CalendarClock className="size-7" /></span>
      <p className="mt-4 font-display text-xl font-bold text-pretty">{message}</p>
      <Link href="/menu" className="mt-5 text-sm font-medium text-gold-ink hover:underline">Browse the menu</Link>
    </div>
  );
}

export function OffersTabs({
  offers, prizes, referral, promotions, initialTab = "offers",
}: {
  promotions: { offers: Promo; wheel: Promo; referral: Promo };
  offers: (Offer & { gives?: string })[];
  prizes: WheelPrize[];
  referral: { enabled: boolean; give: number; get: number; minSpend: number };
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const winnable = prizes.filter((p) => p.kind !== "none");
  const steps = [
    "Share your link or code with a friend who hasn't ordered from us before.",
    `They create an account with it and get ${gbpShort(referral.give)} off their first order (food ${gbpShort(referral.minSpend)}+).`,
    `When their first order of ${gbpShort(referral.minSpend)}+ is completed, you get ${gbpShort(referral.get)} off your next one.`,
  ];

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "offers", label: "Offers", icon: Ticket },
    { id: "wheel", label: "Fortune Wheel", icon: FerrisWheel },
    { id: "refer", label: "Refer & Earn", icon: Gift }, // always listed: a switched-off one shows the owner's message
  ];

  return (
    <div>
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold-ink">Rewards</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Offers &amp; rewards</h1>
        <p className="mt-3 text-muted-foreground text-pretty">Deals, the Fortune Wheel and rewards for referring friends - all exclusive to ordering direct.</p>
      </header>

      {/* Tabs */}
      <div className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition", tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "offers" && !promotions.offers.enabled && <CampaignOver message={promotions.offers.message} />}
        {tab === "wheel" && !promotions.wheel.enabled && <CampaignOver message={promotions.wheel.message} />}
        {tab === "refer" && !promotions.referral.enabled && <CampaignOver message={promotions.referral.message} />}

        {tab === "offers" && promotions.offers.enabled && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => {
              const Icon = KIND_ICON[o.kind] ?? Ticket;
              return (
                <div key={o.id} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-gold-ink"><Icon className="size-5" /></span>
                    {o.badge && <Badge variant="outline" className="border-gold/30 bg-gold/10 text-gold-ink">{o.badge}</Badge>}
                  </div>
                  <h2 className="mt-4 font-display text-xl font-bold">{o.title}</h2>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{o.description}</p>
                  {o.code && <div className="mt-4"><CopyCode code={o.code} /></div>}
                  {o.gives && <p className="mt-2 text-sm font-medium text-gold-ink">{o.gives}</p>}
                  {o.terms && <p className="mt-4 text-xs text-muted-foreground">{o.terms}</p>}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
              One discount per order unless stated. <Link href="/legal/promotions" className="font-medium text-gold-ink hover:underline">Full promotion terms</Link>
            </p>
          </div>
        )}

        {tab === "wheel" && promotions.wheel.enabled && (
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
            <SpinWheel prizes={prizes} />
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Gift className="size-5 text-sambal" /> What you can win</h2>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {winnable.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"><Gift className="size-4 text-gold-ink" /> {p.label}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ShieldCheck className="size-5 text-jade" /> Fair play</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>One spin per account, per week.</li>
                  <li>Rewards apply to direct website orders and expire after 7 days.</li>
                  <li>Can&apos;t be combined with first-order offers. No cash alternative.</li>
                  <li>Spins unlock after your first order. Prizes are chosen at random and some spins don&apos;t win. Spinning is free, and your order price is the same whether or not you play.</li>
                  <li>Promoter: Sambal &amp; Sakura Ltd. <Link href="/legal/promotions#wheel" className="font-medium text-gold-ink hover:underline">Full terms</Link></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === "refer" && promotions.referral.enabled && referral.enabled && (
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
            <ol className="flex flex-col gap-5">
              {steps.map((step, i) => {
                const Icon = STEP_ICONS[i] ?? Share2;
                return (
                  <li key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-gold-ink"><Icon className="size-5" /></span>
                    <div>
                      <p className="font-display text-lg font-bold">Step {i + 1}</p>
                      <p className="text-muted-foreground">{step}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div>
              <ReferralWidget />
              <p className="mt-4 text-xs text-muted-foreground">For new customers only: one referral per person and phone number. Your friend&apos;s reward is a first-order offer, so it can&apos;t be combined with other first-order offers. Orders from your own phone number or delivered to your address don&apos;t count, and self-referrals or duplicate accounts are void. Both rewards are for website orders, expire 90 days after they&apos;re issued and have no cash value. Your friend has 90 days to complete their first order. We may withdraw rewards that break these terms. <Link href="/legal/promotions#referral" className="font-medium text-gold-ink hover:underline">Full terms</Link></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
