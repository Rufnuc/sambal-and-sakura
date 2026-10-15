"use client";

import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyAuthDialog } from "@/components/account/lazy-auth-dialog";
import { useAuth } from "@/lib/store/auth";
import { storeRef, storedRef } from "@/lib/referral-ref";
import { gbpShort } from "@/lib/format";

/**
 * Handles a friend's link (/?ref=CODE, on any page): remembers the code, tidies the address bar, and
 * shows signed-out visitors a banner to claim their reward. The sign-up form fills the code in.
 */
export function ReferralCapture() {
  const { user } = useAuth();
  const [offer, setOffer] = useState<{ give: number; minSpend: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) {
      storeRef(ref);
      url.searchParams.delete("ref"); // keep shared/bookmarked addresses clean (and one canonical URL)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (!storedRef()) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("ss_ref_banner") === "x"; } catch { /* ignore */ }
    if (dismissed) return;
    fetch("/api/public-config").then((r) => r.json()).then((d) => { if (d.referral) setOffer(d.referral); }).catch(() => {});
  }, []);

  if (!offer || hidden || user) return <LazyAuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode="signup" />;
  return (
    <div className="border-b border-gold/30 bg-gold/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <Gift className="size-4 shrink-0 text-gold-ink" />
        <p className="flex-1">A friend gave you <b>{gbpShort(offer.give)} off</b> your first order (food {gbpShort(offer.minSpend)}+). Create an account to claim it.</p>
        <Button className="h-8 shrink-0 px-3" onClick={() => setAuthOpen(true)}>Claim</Button>
        <button
          type="button" aria-label="Hide this message" className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          onClick={() => { setHidden(true); try { sessionStorage.setItem("ss_ref_banner", "x"); } catch { /* ignore */ } }}
        ><X className="size-4" /></button>
      </div>
      <LazyAuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode="signup" />
    </div>
  );
}
