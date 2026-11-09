"use client";

import { useState } from "react";
import { Save, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/ui";
import { saveConfig, type LoyaltyCfg } from "@/lib/admin/api";
import { gbp } from "@/lib/format";

/** The owner's points scheme: how points are earned and what they're worth. */
export function LoyaltyCard({ initial }: { initial: LoyaltyCfg }) {
  const [l, setL] = useState<LoyaltyCfg>(initial);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<LoyaltyCfg>) => setL({ ...l, ...p });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  async function save() {
    setBusy(true);
    try { const c = await saveConfig({ loyalty: l }); setL(c.loyalty); toast.success("Points settings saved - the website shows the new values"); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  // What a customer actually gets back, e.g. "£30 of food earns 300 points; 100 points = £5 (about 1.7% back)".
  const back = l.pointsPerPound > 0 && l.redeemPoints > 0 ? (l.pointsPerPound * l.redeemValue) / l.redeemPoints * 100 : 0;
  return (
    <SectionCard title="Loyalty points" action={<Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={save}><Save className="size-4" /> Save</Button>}>
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-gold/10 px-3 py-2 text-sm">
        <Star className="mt-0.5 size-4 shrink-0 text-gold-ink" />
        <span>
          A {gbp(30)} order earns <b>{Math.round(30 * l.pointsPerPound)} points</b>. <b>{l.redeemPoints} points</b> = a <b>{gbp(l.redeemValue)}</b> voucher
          {back > 0 ? <> (customers get about <b>{back.toFixed(1)}%</b> back)</> : null}.
        </span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><Label htmlFor="ly-earn">Points earned per £1 of food</Label><Input id="ly-earn" type="number" min={0} max={100} step={1} value={l.pointsPerPound} onChange={(e) => set({ pointsPerPound: num(e.target.value) })} className="mt-1.5 h-10" /></div>
        <div><Label htmlFor="ly-redeem">Points needed for a voucher</Label><Input id="ly-redeem" type="number" min={1} step={1} value={l.redeemPoints} onChange={(e) => set({ redeemPoints: Math.round(num(e.target.value)) })} className="mt-1.5 h-10" /></div>
        <div><Label htmlFor="ly-value">That voucher is worth (£)</Label><Input id="ly-value" type="number" min={0.5} step={0.5} value={l.redeemValue} onChange={(e) => set({ redeemValue: num(e.target.value) })} className="mt-1.5 h-10" /></div>
        <div><Label htmlFor="ly-days">Voucher lasts (days)</Label><Input id="ly-days" type="number" min={1} max={730} step={1} value={l.voucherDays} onChange={(e) => set({ voucherDays: Math.round(num(e.target.value)) })} className="mt-1.5 h-10" /></div>
        <div><Label htmlFor="ly-welcome">Sign-up bonus points (0 = none)</Label><Input id="ly-welcome" type="number" min={0} step={1} value={l.welcomePoints} onChange={(e) => set({ welcomePoints: Math.round(num(e.target.value)) })} className="mt-1.5 h-10" /></div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Changes apply from when you save: new orders earn at the new rate, and points customers already have are worth the new value when they redeem.
        Your Terms say customers get 30 days&apos; email notice before the scheme changes in a way that affects them, so email account holders before lowering what points are worth.
      </p>
    </SectionCard>
  );
}
