"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/ui";
import { fetchCancelPolicy, saveCancelPolicy, type CancelPolicy } from "@/lib/admin/api";

/** Owner: how long customers can cancel online, and what happens to people who cancel often. */
export function CancelPolicyCard() {
  const [p, setP] = useState<CancelPolicy | null>(null);
  useEffect(() => { fetchCancelPolicy().then(setP); }, []);
  if (!p) return null;

  const num = (k: keyof CancelPolicy, label: string, hint: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" inputMode="numeric" value={p[k] as number} onChange={(e) => setP({ ...p, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="mt-1 h-10" />
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <SectionCard title="Cancellations" action={<Ban className="size-5 text-sambal" />}>
      <p className="text-sm text-muted-foreground">
        Customers can cancel from their tracking page for a short time after ordering. Cancellations they make, and orders marked
        &quot;not collected&quot;, count towards the limits below (cancellations for restaurant reasons don&apos;t).
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {num("customerCancelMinutes", "Online cancel window (minutes)", "From when they order. 0 = phone only.")}
        {num("scheduledCutoffMinutes", "Orders for later: until (minutes before)", "How long before the chosen time they can still cancel.")}
        {num("windowDays", "Count cancellations over (days)", "Older ones stop counting.")}
        {num("flagAt", "Flag after (cancellations)", "Tickets and admin show \"call to confirm\".")}
        {num("restrictAt", "Restrict after (cancellations)", "See the option below.")}
        <div>
          <Label className="text-xs">When restricted</Label>
          <select value={p.restrictAction} onChange={(e) => setP({ ...p, restrictAction: e.target.value as CancelPolicy["restrictAction"] })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
            <option value="block-cash-delivery">No online cancelling, no cash delivery</option>
            <option value="flag-only">Just flag them (staff decide)</option>
          </select>
        </div>
      </div>
      <Button className="mt-4 h-10" onClick={async () => {
        const r = await saveCancelPolicy(p);
        if (r.ok) toast.success("Cancellation rules saved"); else toast.error(r.error);
      }}>Save</Button>
    </SectionCard>
  );
}
