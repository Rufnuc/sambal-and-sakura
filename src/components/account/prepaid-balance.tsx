"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Terms = { title: string; version: string; sections: { h: string; list: string[] }[] };
type Entry = { id: string; at: string; label: string; amount: number; after: number };
type Data =
  | { status: "none" }
  | { status: "offered" | "active" | "declined"; balance: number; pct: number; acceptedAt: string | null; terms: Terms; entries: Entry[] };

/**
 * The customer's prepaid balance on their account page. Shows nothing unless the restaurant has offered it
 * to them. Offered: the separate prepaid-balance terms, to accept or decline. Accepted: balance + history.
 */
export function PrepaidBalance() {
  const [d, setD] = useState<Data | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/account/balance", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- loads from the server

  async function answer(action: "accept" | "decline") {
    if (!d || d.status === "none") return;
    if (action === "decline" && !window.confirm(d.balance > 0 ? `Decline the prepaid balance? The restaurant will refund the ${gbp(d.balance)} you've paid in.` : "Decline the prepaid balance?")) return;
    setBusy(true);
    const r = await fetch("/api/account/balance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version: d.terms.version }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j.error ?? "Please try again."); void load(); return; }
    toast.success(action === "accept" ? "Thanks - your prepaid balance is ready to use." : "Declined. The restaurant will refund anything you've paid in.");
    void load();
  }

  if (!d || d.status === "none") return null;

  const termsBox = (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm">
      <p className="font-display text-lg font-bold">{d.terms.title}</p>
      {d.terms.sections.map((s) => (
        <div key={s.h} className="mt-3">
          <p className="font-semibold">{s.h}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{s.list.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      ))}
      <p className="mt-3 text-xs text-muted-foreground">Version {d.terms.version}</p>
    </div>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold"><Wallet className="size-5 text-gold-ink" /> Prepaid balance</h2>

      {d.status === "offered" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            The restaurant has set up a prepaid balance for you{d.pct > 0 ? `, with ${d.pct}% off the food when you pay from it` : ""}.
            {d.balance > 0 ? <> They&apos;ve recorded <b>{gbp(d.balance)}</b> paid in.</> : null} Please read these terms before you use it.
          </p>
          {termsBox}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I&apos;ve read and accept the prepaid balance terms.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!agree || busy} onClick={() => answer("accept")}>Accept and use my balance</Button>
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => answer("decline")}>Decline</Button>
          </div>
          <p className="text-xs text-muted-foreground">If you decline, the restaurant will refund anything you&apos;ve paid in.</p>
        </div>
      )}

      {d.status === "declined" && (
        <p className="text-sm">
          You declined the prepaid balance.{d.balance > 0 ? <> The restaurant will refund the <b>{gbp(d.balance)}</b> you paid in: if you haven&apos;t heard from them, please get in touch.</> : " Nothing is held for you."}
        </p>
      )}

      {d.status === "active" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Available</p>
              <p className="font-display text-3xl font-bold">{gbp(d.balance)}</p>
              {d.pct > 0 && <p className="text-sm text-jade">{d.pct}% off the food when you pay from your balance</p>}
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowTerms((v) => !v)}><ScrollText className="size-4" /> {showTerms ? "Hide terms" : "View terms"}</Button>
          </div>
          {showTerms && termsBox}
          <p className="text-xs text-muted-foreground">Use it online by ticking &ldquo;Pay from my balance&rdquo; at checkout, or ask staff when you eat in.</p>
          {d.entries.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {d.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{e.label}</span>
                    <span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <span className="text-right">
                    <span className={cn("block font-semibold", e.amount > 0 ? "text-jade" : "")}>{e.amount > 0 ? "+" : "−"}{gbp(Math.abs(e.amount))}</span>
                    <span className="text-xs text-muted-foreground">Balance {gbp(e.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
