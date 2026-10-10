"use client";

import { useEffect, useState } from "react";
import { Gift, Sparkles, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SectionCard, StatCard } from "@/components/admin/ui";
import { fetchConfig, saveConfig, type ReferralCfg, type OfferCfg, type WheelPrizeCfg, type DealCfg } from "@/lib/admin/api";
import { fetchStats, fetchAnalytics } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

export function PromosView() {
  const [referral, setReferral] = useState<ReferralCfg>({ give: 5, get: 5, minSpend: 20, maxPerUser: 10 });
  const [offers, setOffers] = useState<OfferCfg[]>([]);
  const [prizes, setPrizes] = useState<WheelPrizeCfg[]>([]);
  const [deal, setDeal] = useState<DealCfg>({ active: false, title: "", description: "", badge: "Deal of the Day" });
  const [discountedOrders, setDiscountedOrders] = useState(0);
  const [spins, setSpins] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([fetchConfig(), fetchStats(), fetchAnalytics(14)]).then(([c, stats, analytics]) => {
      setReferral(c.referral); setOffers(c.offers); setPrizes(c.wheelPrizes); setDeal(c.deal);
      setDiscountedOrders(stats ? Math.round((stats.kpis.voucherRedemptionPct / 100) * stats.kpis.orders) : 0);
      setSpins(analytics?.counts.spin_wheel_played ?? 0);
      setReady(true);
    });
  }, []);

  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" />;

  const totalWeight = prizes.reduce((n, p) => n + p.weight, 0) || 1;

  // Each save shows the server's reason if it rejects something (e.g. a prize label without an amount).
  async function save<T>(patch: Parameters<typeof saveConfig>[0], apply: (c: Awaited<ReturnType<typeof saveConfig>>) => T, ok: string) {
    try { apply(await saveConfig(patch)); toast.success(ok); } catch (e) { toast.error((e as Error).message); }
  }
  const saveDeal = () => save({ deal }, (c) => setDeal(c.deal), "Deal of the Day saved");
  const saveReferral = () => save({ referral }, (c) => setReferral(c.referral), "Referral settings saved");
  const saveOffers = () => save({ offers }, (c) => setOffers(c.offers), "Offers saved");
  const savePrizes = () => save({ wheelPrizes: prizes }, (c) => setPrizes(c.wheelPrizes), "Wheel prizes saved");

  function addOffer() {
    setOffers((o) => [...o, { id: "offer" + Date.now().toString(36), title: "New offer", description: "", code: "", badge: "", terms: "", kind: "percent" }]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Promotions</h1>
        <p className="text-muted-foreground">Edit offers, the Fortune Wheel and referral rewards</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Offers" value={String(offers.length)} accent="gold" />
        <StatCard label="Orders w/ discount" value={String(discountedOrders)} accent="jade" />
        <StatCard label="Wheel spins" value={String(spins)} sub="this session" accent="sakura" />
        <StatCard label="Referral" value={`£${referral.give}/£${referral.get}`} sub="give / get" accent="sambal" />
      </div>

      {/* Referral */}
      {/* Deal of the Day */}
      <SectionCard title="Deal of the Day" action={<Button size="sm" className="h-9 gap-1.5" onClick={saveDeal}><Save className="size-4" /> Save</Button>}>
        <div className="flex items-center gap-3">
          <button onClick={() => setDeal({ ...deal, active: !deal.active })} role="switch" aria-checked={deal.active} className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition", deal.active ? "bg-jade" : "bg-muted")}>
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", deal.active ? "translate-x-6" : "translate-x-1")} />
          </button>
          <span className="text-sm text-muted-foreground">{deal.active ? "Live on the menu page" : "Hidden"}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div><Label className="text-xs">Title</Label><Input value={deal.title} onChange={(e) => setDeal({ ...deal, title: e.target.value })} className="mt-1 h-10" placeholder="e.g. Chicken Katsu Curry + drink" /></div>
          <div><Label className="text-xs">Price £ (optional)</Label><Input type="number" step="0.5" value={deal.price ?? ""} onChange={(e) => setDeal({ ...deal, price: e.target.value ? Number(e.target.value) : undefined })} className="mt-1 h-10" inputMode="decimal" /></div>
          <div><Label className="text-xs">Badge</Label><Input value={deal.badge} onChange={(e) => setDeal({ ...deal, badge: e.target.value })} className="mt-1 h-10" /></div>
        </div>
        <div className="mt-3"><Label className="text-xs">Description</Label><Input value={deal.description} onChange={(e) => setDeal({ ...deal, description: e.target.value })} className="mt-1 h-10" placeholder="Short description shown to customers" /></div>
      </SectionCard>

      <SectionCard title="Referral programme" action={<Button size="sm" className="h-9 gap-1.5" onClick={saveReferral}><Save className="size-4" /> Save</Button>}>
        <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Not live yet: the referral page is hidden from customers until referral rewards are paid out automatically. These settings are kept ready for then.
        </p>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sambal/10 text-sambal"><Gift className="size-5" /></span>
          <div className="grid flex-1 gap-3 sm:grid-cols-4">
            <div><Label className="text-xs">Friend gets £</Label><Input type="number" value={referral.give} onChange={(e) => setReferral({ ...referral, give: Number(e.target.value) })} className="mt-1 h-10" inputMode="decimal" /></div>
            <div><Label className="text-xs">You get £</Label><Input type="number" value={referral.get} onChange={(e) => setReferral({ ...referral, get: Number(e.target.value) })} className="mt-1 h-10" inputMode="decimal" /></div>
            <div><Label className="text-xs">Min spend £</Label><Input type="number" value={referral.minSpend} onChange={(e) => setReferral({ ...referral, minSpend: Number(e.target.value) })} className="mt-1 h-10" inputMode="decimal" /></div>
            <div><Label className="text-xs">Max per customer</Label><Input type="number" value={referral.maxPerUser} onChange={(e) => setReferral({ ...referral, maxPerUser: Number(e.target.value) })} className="mt-1 h-10" inputMode="numeric" /></div>
          </div>
        </div>
      </SectionCard>

      {/* Offers */}
      <SectionCard title="Offers & vouchers" action={<Button size="sm" className="h-9 gap-1.5" onClick={saveOffers}><Save className="size-4" /> Save</Button>}>
        <div className="flex flex-col gap-3">
          {offers.map((o, i) => (
            <div key={o.id} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.3fr_2fr_0.8fr_0.8fr_auto] sm:items-end">
              <div><Label className="text-xs">Title</Label><Input value={o.title} onChange={(e) => setOffers((os) => os.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Description</Label><Input value={o.description} onChange={(e) => setOffers((os) => os.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Code</Label><Input value={o.code ?? ""} onChange={(e) => setOffers((os) => os.map((x, idx) => idx === i ? { ...x, code: e.target.value.toUpperCase() } : x))} className="mt-1 h-10" /></div>
              <div><Label className="text-xs">Badge</Label><Input value={o.badge ?? ""} onChange={(e) => setOffers((os) => os.map((x, idx) => idx === i ? { ...x, badge: e.target.value } : x))} className="mt-1 h-10" /></div>
              <button aria-label="Remove offer" onClick={() => setOffers((os) => os.filter((_, idx) => idx !== i))} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-sambal"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <Button variant="outline" className="mt-3 h-10 gap-1.5" onClick={addOffer}><Plus className="size-4" /> Add offer</Button>
        <p className="mt-2 text-xs text-muted-foreground">Note: discount amounts for voucher codes are set in server pricing; these cards control what customers see on the Offers page.</p>
      </SectionCard>

      {/* Wheel */}
      <SectionCard title="Fortune Wheel prizes" action={<Button size="sm" className="h-9 gap-1.5" onClick={savePrizes}><Save className="size-4" /> Save</Button>}>
        <div className="flex flex-col gap-2">
          {prizes.map((p, i) => (
            <div key={p.id} className="grid grid-cols-[1.6fr_0.8fr_0.8fr] items-center gap-2 rounded-lg border border-border p-2.5">
              <Input value={p.label} onChange={(e) => setPrizes((ps) => ps.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} className="h-9" />
              <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">weight</span><Input type="number" value={p.weight} onChange={(e) => setPrizes((ps) => ps.map((x, idx) => idx === i ? { ...x, weight: Number(e.target.value) } : x))} className="h-9" inputMode="numeric" /></div>
              <span className="text-right text-sm tabular-nums text-muted-foreground">{Math.round((p.weight / totalWeight) * 100)}%</span>
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5 text-gold-ink" /> Probability is each prize's weight ÷ total. One spin per customer per week.</p>
      </SectionCard>
    </div>
  );
}
