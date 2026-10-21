"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMenu } from "@/lib/use-menu";
import type { OfferCfg } from "@/lib/admin/api";

type Gives = "pct" | "amount" | "free";
const givesOf = (o: OfferCfg): Gives => (o.amountOff !== undefined ? "amount" : o.freeItemId !== undefined ? "free" : "pct");
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** What an offer's code gives at checkout. Saved with the offer; checkout uses exactly these settings. */
export function OfferCodeSettings({ offer, onChange }: { offer: OfferCfg; onChange: (o: OfferCfg) => void }) {
  const { menu } = useMenu();
  const gives = givesOf(offer);
  const setGives = (g: Gives) => onChange({
    ...offer,
    pctOff: g === "pct" ? offer.pctOff ?? 10 : undefined,
    amountOff: g === "amount" ? offer.amountOff ?? 5 : undefined,
    freeItemId: g === "free" ? offer.freeItemId ?? menu[0]?.id : undefined,
  });
  const field = "mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-2.5 sm:grid-cols-[1fr_1.4fr_0.8fr_auto] sm:items-end">
      <div>
        <Label className="text-xs">Code {offer.code} gives</Label>
        <select value={gives} onChange={(e) => setGives(e.target.value as Gives)} className={field}>
          <option value="pct">% off</option>
          <option value="amount">£ off</option>
          <option value="free">A free dish</option>
        </select>
      </div>
      <div>
        {gives === "pct" && (<><Label className="text-xs">% off the food</Label><Input type="number" min={1} max={50} value={offer.pctOff ?? ""} onChange={(e) => onChange({ ...offer, pctOff: num(e.target.value) })} className="mt-1 h-10" inputMode="numeric" /></>)}
        {gives === "amount" && (<><Label className="text-xs">£ off</Label><Input type="number" min={0.5} step={0.5} value={offer.amountOff ?? ""} onChange={(e) => onChange({ ...offer, amountOff: num(e.target.value) })} className="mt-1 h-10" inputMode="decimal" /></>)}
        {gives === "free" && (<><Label className="text-xs">Free dish</Label>
          <select value={offer.freeItemId} onChange={(e) => onChange({ ...offer, freeItemId: e.target.value })} className={field}>
            {menu.filter((m) => !m.phoneOrder).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></>)}
      </div>
      <div><Label className="text-xs">Min spend £</Label><Input type="number" min={0} value={offer.minSpend ?? ""} onChange={(e) => onChange({ ...offer, minSpend: num(e.target.value) })} className="mt-1 h-10" inputMode="decimal" placeholder="0" /></div>
      <div className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!offer.firstOrderOnly} onChange={(e) => onChange({ ...offer, firstOrderOnly: e.target.checked || undefined, oncePerCustomer: e.target.checked ? undefined : offer.oncePerCustomer })} className="size-4" /> First order only</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!offer.oncePerCustomer} disabled={!!offer.firstOrderOnly} onChange={(e) => onChange({ ...offer, oncePerCustomer: e.target.checked || undefined })} className="size-4" /> Once per customer</label>
        <label className="flex items-center gap-1.5" title="The code still works at checkout - for flyers, emails or staff to hand out"><input type="checkbox" checked={!!offer.hidden} onChange={(e) => onChange({ ...offer, hidden: e.target.checked || undefined })} className="size-4" /> Hidden from Offers page</label>
      </div>
    </div>
  );
}
