"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { gbp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Entry = { id: string; at: string; label: string; amount: number; after: number; by: string | null };
type View = {
  id: string; name: string; email: string; accountStatus: string; canManage: boolean;
  status: "none" | "offered" | "active" | "declined"; balance: number; pct: number; acceptedAt: string | null;
  entries: Entry[];
  result?: { bill: number; discount: number; due: number; taken: number; stillToPay: number };
};
type Method = "cash" | "card" | "bank";

const STATUS: Record<View["status"], { label: string; tone: string }> = {
  none: { label: "Not offered", tone: "border-border bg-muted text-muted-foreground" },
  offered: { label: "Waiting for the customer to accept", tone: "border-gold/40 bg-gold/10 text-gold-ink" },
  active: { label: "Active", tone: "border-jade/40 bg-jade/10 text-jade" },
  declined: { label: "Declined by the customer", tone: "border-sambal/40 bg-sambal/10 text-sambal" },
};
const select = "h-10 rounded-lg border border-border bg-background px-2 text-sm";

/** A customer's prepaid balance: offer it, add money, take an eat-in bill, refund, set their %. */
export function CustomerBalance({ customerId, open, onOpenChange, onChanged }: { customerId: string | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState("0");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [bill, setBill] = useState("");
  const [refund, setRefund] = useState("");
  const [lastBill, setLastBill] = useState<View["result"] | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    const r = await fetch(`/api/admin/customers/${customerId}/balance`, { cache: "no-store" });
    if (r.ok) { const j: View = await r.json(); setV(j); setPct(String(j.pct)); }
  }, [customerId]);
  useEffect(() => { if (open) { setV(null); setLastBill(null); void load(); } }, [open, load]); // eslint-disable-line react-hooks/set-state-in-effect -- fresh data each time it opens

  async function act(body: Record<string, unknown>, ok: string) {
    if (!customerId) return null;
    setBusy(true);
    const r = await fetch(`/api/admin/customers/${customerId}/balance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j.error ?? "Couldn't save."); return null; }
    setV(j); setPct(String(j.pct)); toast.success(ok); onChanged();
    return j as View;
  }
  const n = (s: string) => Number(s.replace(/[£,\s]/g, ""));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl"><Wallet className="size-5 text-gold-ink" /> Prepaid balance</DialogTitle>
          <DialogDescription>{v ? <>{v.name} · {v.email}</> : "Loading…"}</DialogDescription>
        </DialogHeader>

        {v && (
          <div className="flex flex-col gap-5 text-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Badge variant="outline" className={cn("mb-1", STATUS[v.status].tone)}>{STATUS[v.status].label}</Badge>
                <p className="font-display text-3xl font-bold">{gbp(v.balance)}</p>
                <p className="text-muted-foreground">{v.pct > 0 ? `${v.pct}% off the food on orders paid from the balance` : "No discount"}{v.acceptedAt ? ` · terms accepted ${new Date(v.acceptedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
              </div>
            </div>

            {/* Not offered (or declined): the owner offers it, with this customer's discount. */}
            {(v.status === "none" || (v.status === "declined" && v.balance === 0)) && (v.canManage ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="font-semibold">Offer a prepaid balance</p>
                <p className="text-muted-foreground">The customer will see the prepaid-balance terms in their account and must accept them before the balance can be used. You can record money they hand over straight away; it stays locked until they accept, and is refunded if they decline.</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div><Label htmlFor="cb-pct" className="text-xs">Their % off (0 = none)</Label><Input id="cb-pct" type="number" min={0} max={50} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 h-10 w-28" /></div>
                  <Button className="h-10" disabled={busy} onClick={() => act({ action: "offer", pct: n(pct) || 0 }, "Offered - the customer will see the terms when they sign in")}>Offer prepaid balance</Button>
                </div>
              </div>
            ) : <p className="text-muted-foreground">Only the owner can offer a prepaid balance.</p>)}

            {v.status === "offered" && <p className="rounded-lg bg-gold/10 px-3 py-2">The customer needs to sign in to their account and accept the prepaid-balance terms. Until then the balance can&apos;t be used.</p>}
            {v.status === "declined" && v.balance > 0 && <p className="rounded-lg bg-sambal/10 px-3 py-2 text-sambal">The customer declined. Refund the {gbp(v.balance)} they paid in (below).</p>}

            {/* Eat-in bill: anyone with Customers access, once the customer has accepted. */}
            {v.status === "active" && (
              <div className="flex flex-col gap-2 rounded-xl border border-jade/40 bg-jade/5 p-3">
                <p className="font-semibold">Take an eat-in bill from the balance</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div><Label htmlFor="cb-bill" className="text-xs">Bill (£, before their discount)</Label><Input id="cb-bill" inputMode="decimal" value={bill} onChange={(e) => setBill(e.target.value)} className="mt-1 h-10 w-32" placeholder="45.00" /></div>
                  <div className="min-w-40 flex-1"><Label htmlFor="cb-bnote" className="text-xs">Note (optional)</Label><Input id="cb-bnote" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-10" placeholder="Table 4" /></div>
                  <Button className="h-10" disabled={busy || !(n(bill) > 0)} onClick={async () => {
                    const due = Math.round((n(bill) - n(bill) * v.pct / 100) * 100) / 100;
                    if (!window.confirm(`Take ${gbp(Math.min(due, v.balance))} from ${v.name}'s balance for a ${gbp(n(bill))} bill${v.pct > 0 ? ` (${v.pct}% off = ${gbp(due)})` : ""}?`)) return;
                    const j = await act({ action: "charge", bill: n(bill), note: note || undefined }, "Taken from the balance");
                    if (j?.result) { setLastBill(j.result); setBill(""); setNote(""); }
                  }}>Take from balance</Button>
                </div>
                {lastBill && (
                  <p className={cn("rounded-lg px-3 py-2 font-medium", lastBill.stillToPay > 0 ? "bg-sambal/10 text-sambal" : "bg-jade/10 text-jade")}>
                    Bill {gbp(lastBill.bill)}{lastBill.discount > 0 ? ` − ${gbp(lastBill.discount)} discount = ${gbp(lastBill.due)}` : ""}. Taken from balance: {gbp(lastBill.taken)}.
                    {lastBill.stillToPay > 0 ? ` The customer still needs to pay ${gbp(lastBill.stillToPay)}.` : " Nothing more to pay."}
                  </p>
                )}
              </div>
            )}

            {/* Money in / out and settings: owner only. */}
            {v.canManage && (v.status === "offered" || v.status === "active") && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="font-semibold">Add money the customer has paid</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div><Label htmlFor="cb-amt" className="text-xs">Amount (£)</Label><Input id="cb-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-10 w-32" placeholder="200.00" /></div>
                  <div><Label htmlFor="cb-meth" className="text-xs">Paid by</Label><select id="cb-meth" value={method} onChange={(e) => setMethod(e.target.value as Method)} className={cn(select, "mt-1 block")}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></div>
                  <Button className="h-10" disabled={busy || !(n(amount) > 0)} onClick={async () => {
                    if (!window.confirm(`Add ${gbp(n(amount))} (${method === "bank" ? "bank transfer" : method}) to ${v.name}'s balance?`)) return;
                    if (await act({ action: "topup", amount: n(amount), method }, "Money added")) setAmount("");
                  }}>Add money</Button>
                </div>
              </div>
            )}

            {v.canManage && v.balance > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="font-semibold">Refund</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div><Label htmlFor="cb-ref" className="text-xs">Amount (£, up to {gbp(v.balance)})</Label><Input id="cb-ref" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} className="mt-1 h-10 w-32" placeholder={v.balance.toFixed(2)} /></div>
                  <div><Label htmlFor="cb-rmeth" className="text-xs">Refunded by</Label><select id="cb-rmeth" value={method} onChange={(e) => setMethod(e.target.value as Method)} className={cn(select, "mt-1 block")}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></div>
                  <Button variant="outline" className="h-10" disabled={busy} onClick={async () => {
                    const amt = n(refund) > 0 ? n(refund) : v.balance;
                    if (!window.confirm(`Record a refund of ${gbp(amt)} to ${v.name} (${method === "bank" ? "bank transfer" : method})? Give them the money first.`)) return;
                    if (await act({ action: "refund", amount: amt, method }, "Refund recorded")) setRefund("");
                  }}>Record refund</Button>
                </div>
              </div>
            )}

            {v.canManage && (v.status === "offered" || v.status === "active") && (
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
                <div><Label htmlFor="cb-pct2" className="text-xs">Their % off on orders paid from the balance</Label><Input id="cb-pct2" type="number" min={0} max={50} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 h-10 w-28" /></div>
                <Button variant="outline" className="h-10" disabled={busy || n(pct) === v.pct} onClick={() => act({ action: "pct", pct: n(pct) || 0 }, "Discount updated")}>Save %</Button>
                <Button variant="ghost" className="ml-auto h-10 text-sambal" disabled={busy || v.balance > 0} title={v.balance > 0 ? "Refund the balance first" : undefined}
                  onClick={() => { if (window.confirm("Stop offering the prepaid balance to this customer?")) void act({ action: "withdraw" }, "Prepaid balance withdrawn"); }}>Withdraw offer</Button>
              </div>
            )}

            {v.entries.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">History</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {v.entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{e.label}</span>
                        <span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{e.by ? ` · ${e.by}` : ""}</span>
                      </span>
                      <span className="text-right">
                        <span className={cn("block font-semibold", e.amount > 0 ? "text-jade" : "")}>{e.amount > 0 ? "+" : "−"}{gbp(Math.abs(e.amount))}</span>
                        <span className="text-xs text-muted-foreground">{gbp(e.after)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
