"use client";

import { useState } from "react";
import { Megaphone, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/ui";
import { saveConfig, type PromoKey, type PromotionsCfg } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const ROWS: { key: PromoKey; title: string; stops: string; rewards: boolean }[] = [
  { key: "offers", title: "Offers & vouchers", stops: "Offer codes (e.g. SAKURA10) and the automatic free dish over a spend stop working at checkout.", rewards: false },
  { key: "wheel", title: "Fortune Wheel", stops: "Nobody can spin.", rewards: true },
  { key: "referral", title: "Refer a friend", stops: "New referral codes are ignored and the friend banner disappears.", rewards: true },
];

/** Owner's on/off switch for each promotion on the Offers page, with the message customers see while it's off. */
export function CampaignsCard({ initial, onSaved }: { initial: PromotionsCfg; onSaved: (p: PromotionsCfg) => void }) {
  const [p, setP] = useState<PromotionsCfg>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: PromoKey, patch: Partial<PromotionsCfg[PromoKey]>) => setP({ ...p, [k]: { ...p[k], ...patch } });

  async function save() {
    setBusy(true);
    try {
      const strip = (k: PromoKey) => ({ enabled: p[k].enabled, message: p[k].message, graceDays: p[k].graceDays });
      const c = await saveConfig({ promotions: { offers: strip("offers"), wheel: strip("wheel"), referral: strip("referral") } });
      setP(c.promotions); onSaved(c.promotions);
      toast.success("Campaigns saved - the Offers page has updated");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <SectionCard title="Campaigns" action={<Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={save}><Save className="size-4" /> Save</Button>}>
      <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-gold-ink" />
        Switch a promotion off to end it. Its tab on the Offers page then shows your message instead. Press Save to apply.
      </p>
      <div className="flex flex-col divide-y divide-border">
        {ROWS.map((r) => {
          const c = p[r.key];
          const pausedOn = c.pausedAt ? new Date(c.pausedAt) : null;
          const until = pausedOn ? new Date(pausedOn.getTime() + c.graceDays * 86_400_000) : null;
          return (
            <div key={r.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => set(r.key, { enabled: !c.enabled })} role="switch" aria-checked={c.enabled} aria-label={`${r.title} on or off`} className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", c.enabled ? "bg-jade" : "bg-muted")}>
                  <span className={cn("inline-block size-5 rounded-full bg-white shadow transition", c.enabled ? "translate-x-6" : "translate-x-1")} />
                </button>
                <span className="font-semibold">{r.title}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", c.enabled ? "bg-jade/15 text-jade" : "bg-sambal/10 text-sambal")}>{c.enabled ? "Running" : "Ended"}</span>
              </div>
              {!c.enabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <Label className="text-xs">Message customers see</Label>
                    <Input value={c.message} maxLength={240} onChange={(e) => set(r.key, { message: e.target.value })} className="mt-1 h-10" />
                  </div>
                  {r.rewards && (
                    <div>
                      <Label className="text-xs">Rewards already given stay valid for</Label>
                      <div className="mt-1 flex items-center gap-2"><Input type="number" min={0} max={90} value={c.graceDays} onChange={(e) => set(r.key, { graceDays: Math.max(0, Math.min(90, Math.round(Number(e.target.value) || 0))) })} className="h-10 w-20" inputMode="numeric" /><span className="text-sm text-muted-foreground">days</span></div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {r.stops}{" "}
                    {r.rewards && (until ? `Rewards customers already have work until ${until.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} (or their own expiry, if sooner).` : `Rewards customers already have keep working for ${c.graceDays} day${c.graceDays === 1 ? "" : "s"} after you save (or until their own expiry, if sooner).`)}
                    {" "}Switching back on restores everything.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
