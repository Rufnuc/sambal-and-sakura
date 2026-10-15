"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2, Gift, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyAuthDialog } from "@/components/account/lazy-auth-dialog";
import { useAuth } from "@/lib/store/auth";
import { gbpShort } from "@/lib/format";

interface Summary { enabled: boolean; code: string | null; give: number; get: number; minSpend: number; pending: number; rewarded: number; remaining: number | null }

/** The signed-in customer's real referral code (from the server) and share link. */
export function ReferralWidget() {
  const { user } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [copied, setCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/referrals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Gift className="size-5 text-sambal" />
          <h2 className="font-display text-xl font-bold">Get your referral link</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Create a free account (or sign in) to get your own link to share with friends.</p>
        <Button className="mt-4 h-11 gap-2" onClick={() => setAuthOpen(true)}><UserPlus className="size-4" /> Create account</Button>
        <LazyAuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode="signup" />
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (!data.enabled || !data.code) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">Referral rewards aren&apos;t available on this account.</div>;
  }

  const link = `${window.location.origin}/?ref=${data.code}`;
  const message = `Get ${gbpShort(data.give)} off your first order at Sambal & Sakura (food ${gbpShort(data.minSpend)}+) - sign up with my link:`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1600);
    } catch { toast.error("Couldn't copy."); }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Sambal & Sakura", text: message, url: link });
      else await copy(`${message} ${link}`);
    } catch { /* cancelled */ }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Gift className="size-5 text-sambal" />
        <h2 className="font-display text-xl font-bold">Your referral link</h2>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Your code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="notranslate font-mono text-2xl font-bold text-gold-ink" translate="no">{data.code}</span>
          <Button variant="outline" size="sm" className="h-9" onClick={() => copy(data.code!)}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={link} className="h-11 text-sm text-muted-foreground" aria-label="Referral link" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" className="h-11 gap-2" onClick={share}><Share2 className="size-4" /> Share</Button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-muted p-3"><dt className="text-xs text-muted-foreground">Friends joined</dt><dd className="font-display text-2xl font-bold">{data.pending + data.rewarded}</dd></div>
        <div className="rounded-xl bg-muted p-3"><dt className="text-xs text-muted-foreground">Rewards earned</dt><dd className="font-display text-2xl font-bold">{data.rewarded}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        You get {gbpShort(data.get)} off once a friend&apos;s first order of {gbpShort(data.minSpend)}+ is completed. Rewards appear in your account.
        {data.remaining !== null && ` You can refer ${data.remaining} more friend${data.remaining === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
