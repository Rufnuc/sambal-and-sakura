"use client";

import { useState } from "react";
import { Ticket, Sparkles, Gift, BadgePercent, ShieldCheck, Share2, UserPlus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/copy-code";
import { SpinWheel } from "@/components/wheel/spin-wheel";
import { ReferralWidget } from "@/components/refer/referral-widget";
import { FEATURES, type Offer, type WheelPrize } from "@/lib/data/site";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, React.ElementType> = { "first-order": Sparkles, bundle: Ticket, freebie: Gift, percent: BadgePercent };
const STEP_ICONS = [Share2, UserPlus, Wallet];

type Tab = "offers" | "wheel" | "refer";

export function OffersTabs({
  offers, prizes, referral, initialTab = "offers",
}: {
  offers: Offer[];
  prizes: WheelPrize[];
  referral: { give: number; get: number; minSpend: number };
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab === "refer" && !FEATURES.referrals ? "offers" : initialTab);
  const winnable = prizes.filter((p) => p.kind !== "none");
  const steps = [
    "Share your unique link or code with a friend.",
    `They get £${referral.give} off their first direct order (min £${referral.minSpend}).`,
    `Once their order completes, your £${referral.get} reward unlocks automatically.`,
  ];

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "offers", label: "Offers", icon: Ticket },
    { id: "wheel", label: "Fortune Wheel", icon: Sparkles },
    ...(FEATURES.referrals ? [{ id: "refer" as const, label: "Refer & Earn", icon: Gift }] : []),
  ];

  return (
    <div>
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold-ink">Rewards</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Offers &amp; rewards</h1>
        <p className="mt-3 text-muted-foreground text-pretty">Deals and the Fortune Wheel - all exclusive to ordering direct.</p>
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
        {tab === "offers" && (
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
                  {o.terms && <p className="mt-4 text-xs text-muted-foreground">{o.terms}</p>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "wheel" && (
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
            <SpinWheel prizes={prizes} />
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Gift className="size-5 text-sambal" /> What you can win</h2>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {winnable.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"><Sparkles className="size-4 text-gold-ink" /> {p.label}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ShieldCheck className="size-5 text-jade" /> Fair play</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>One spin per account, per week.</li>
                  <li>Rewards apply to direct website orders and expire after 7 days.</li>
                  <li>Can&apos;t be combined with first-order offers. No cash alternative.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === "refer" && FEATURES.referrals && (
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
              <p className="mt-4 text-xs text-muted-foreground">One reward per new customer. Rewards apply to website orders only and can&apos;t be combined with first-order offers. Self-referrals and duplicate accounts are void.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
