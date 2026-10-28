"use client";

import { useState } from "react";
import { BadgePercent, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/ui";
import { saveConfig, type OnlineDiscountCfg } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const select = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm";
const FRESH: OnlineDiscountCfg = {
  enabled: true, pctOff: 10, appliesTo: "all", minSpend: 0, withCodes: "best", pauseFirstOrderCodes: true,
  message: "Order direct on our website and save {pct}%.",
};

/**
 * The owner's online order discount: "order direct on our website and save 10%". Shown in the basket, at
 * checkout, on the confirmation and tracking pages, in order emails and on the printed receipt.
 */
export function OnlineDiscountCard({ initial }: { initial: OnlineDiscountCfg | null }) {
  const [d, setD] = useState<OnlineDiscountCfg | null>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<OnlineDiscountCfg>) => d && setD({ ...d, ...patch });

  async function save(value: OnlineDiscountCfg | null, ok: string) {
    setBusy(true);
    try { const c = await saveConfig({ onlineDiscount: value }); setD(c.onlineDiscount); toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  if (!d) {
    return (
      <SectionCard title="Online order discount">
        <p className="mb-3 text-sm text-muted-foreground">There&apos;s no online order discount. Web orders are charged full price, and nothing about it shows to customers.</p>
        <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => save(FRESH, "Online order discount created (10%)")}><Plus className="size-4" /> Create one</Button>
      </SectionCard>
    );
  }

  const preview = d.message.replace(/\{pct\}/g, String(d.pctOff));
  return (
    <SectionCard
      title="Online order discount"
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy}
            onClick={() => save({ ...d, enabled: !d.enabled }, d.enabled ? "Online discount paused" : "Online discount running again")}>
            {d.enabled ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Resume</>}
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-sambal" disabled={busy}
            onClick={() => { if (confirm("Delete the online order discount? Web orders go back to full price. Past orders keep their discount.")) save(null, "Online discount deleted"); }}>
            <Trash2 className="size-4" /> Delete
          </Button>
          <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => save(d, "Online discount saved")}><Save className="size-4" /> Save</Button>
        </div>
      }
    >
      <p className={cn("mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm", d.enabled ? "bg-jade/10 text-jade" : "bg-muted text-muted-foreground")}>
        <BadgePercent className="mt-0.5 size-4 shrink-0" />
        <span>
          {d.enabled ? "Running. " : "Paused: nobody gets it and customers don't see it. "}
          Customers see: <span className="font-medium">&ldquo;{preview}&rdquo;</span>
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="od-pct">Discount (% off the food)</Label>
          <Input id="od-pct" type="number" min={1} max={50} step={0.5} value={d.pctOff} onChange={(e) => set({ pctOff: Number(e.target.value) })} className="mt-1.5 h-10" />
        </div>
        <div>
          <Label htmlFor="od-min">Minimum food spend (£, 0 = any order)</Label>
          <Input id="od-min" type="number" min={0} step={0.5} value={d.minSpend} onChange={(e) => set({ minSpend: Number(e.target.value) })} className="mt-1.5 h-10" />
        </div>
        <div>
          <Label htmlFor="od-for">Applies to</Label>
          <select id="od-for" value={d.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as OnlineDiscountCfg["appliesTo"] })} className={cn(select, "mt-1.5")}>
            <option value="all">Delivery and collection</option>
            <option value="delivery">Delivery only</option>
            <option value="collection">Collection only</option>
          </select>
        </div>
        <div>
          <Label htmlFor="od-codes">With offer codes and rewards</Label>
          <select id="od-codes" value={d.withCodes} onChange={(e) => set({ withCodes: e.target.value as OnlineDiscountCfg["withCodes"] })} className={cn(select, "mt-1.5")}>
            <option value="best">One or the other - whichever saves the customer more</option>
            <option value="stack">Both - the code comes off as well</option>
            <option value="stack-except-first-order">Both, except first-order codes (whichever saves more)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="od-msg">Message customers see (use {"{pct}"} for the percentage)</Label>
          <Input id="od-msg" maxLength={160} value={d.message} onChange={(e) => set({ message: e.target.value })} className="mt-1.5 h-10" />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={d.pauseFirstOrderCodes} onChange={(e) => set({ pauseFirstOrderCodes: e.target.checked })} />
          <span>Pause first-order codes (e.g. SAKURA10, WELCOME10) while this runs. They&apos;re hidden on the Offers page and refused at checkout, so customers aren&apos;t offered two versions of the same 10%. They come back when this is paused or deleted.</span>
        </label>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Changes apply to new orders only. Press Save after editing; Pause and Delete apply straight away.</p>
    </SectionCard>
  );
}
