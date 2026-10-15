"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchReferrals, voidReferralApi, type ReferralRow } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const STATUS: Record<ReferralRow["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for first order", cls: "bg-gold/15 text-gold-ink" },
  rewarded: { label: "Rewarded", cls: "bg-jade/15 text-jade" },
  void: { label: "Void", cls: "bg-muted text-muted-foreground" },
};
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Owner's list of referrals, with "Void" for anything that looks like abuse. */
export function ReferralsList() {
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => fetchReferrals().then(setRows);
  useEffect(() => { void load(); }, []);

  async function voidOne(r: ReferralRow) {
    const reason = window.prompt(`Void ${r.referee.name}'s referral by ${r.referrer.name}? Unused rewards from it will stop working.\n\nReason (optional):`, "");
    if (reason === null) return;
    setBusy(r.id);
    const res = await voidReferralApi(r.id, reason);
    setBusy(null);
    if (res.ok) { toast.success("Referral voided"); void load(); } else toast.error(res.error);
  }

  if (!rows) return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No referrals yet.</p>;
  return (
    <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <p className="truncate"><b>{r.referrer.name}</b> referred <b>{r.referee.name}</b></p>
            <p className="truncate text-xs text-muted-foreground">
              {day(r.createdAt)} · code {r.code}{r.orderId ? ` · order ${r.orderId}` : ""}{r.voidReason ? ` · ${r.voidReason}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
            {r.status !== "void" && <Button variant="outline" size="sm" className="h-8" disabled={busy === r.id} onClick={() => voidOne(r)}>Void</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
