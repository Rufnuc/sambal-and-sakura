"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/store/auth";
import { Turnstile } from "@/components/turnstile";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { storedRef, clearRef } from "@/lib/referral-ref";
import { gbpShort } from "@/lib/format";

export function AuthDialog({
  open, onOpenChange, defaultMode = "signin",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultMode?: "signin" | "signup";
}) {
  const { login, register, reactivate, loyalty } = useAuth();
  const { locale } = useLocale();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(defaultMode);
  const [forgotSent, setForgotSent] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [offers, setOffers] = useState(false); // unticked by default: offers need a clear yes
  const [reactivateBy, setReactivateBy] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [humanToken, setHumanToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [referral, setReferral] = useState<{ give: number; minSpend: number } | null>(null); // null = referrals off
  const [refCode, setRefCode] = useState("");

  // The bot check (only shown when it's switched on) protects sign-up from mass fake accounts.
  useEffect(() => {
    if (!open) return;
    fetch("/api/public-config").then((r) => r.json()).then((d) => {
      setSiteKey(d.turnstileSiteKey ?? null);
      setReferral(d.referral ?? null);
      setRefCode((c) => c || storedRef()); // a friend's code from their link
    }).catch(() => {});
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      setBusy(true);
      const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) setForgotSent(d.message); else toast.error(d.error ?? "Something went wrong.");
      return;
    }
    if (mode === "signup" && siteKey && !humanToken) { toast.error("Please complete the security check."); return; }
    setBusy(true);
    const res = mode === "signin" ? await login(email, password) : await register(name, email, phone, password, humanToken, offers, locale, referral ? refCode : undefined);
    setBusy(false);
    if (res.deactivated && res.reactivateBy) { setReactivateBy(res.reactivateBy); return; }
    if (mode === "signup" && !res.ok) { setHumanToken(""); setResetKey((n) => n + 1); }
    if (res.ok) {
      if (mode === "signup") clearRef();
      toast.success(mode === "signin" ? "Welcome back!" : referral && refCode ? `Account created - your friend's ${gbpShort(referral.give)} off is in your rewards (food ${gbpShort(referral.minSpend)}+, first order).` : loyalty.welcomePoints > 0 ? `Account created - welcome! Your ${loyalty.welcomePoints} bonus points unlock with your first completed order.` : "Account created - welcome!");
      onOpenChange(false);
      setName(""); setEmail(""); setPhone(""); setPassword("");
    } else {
      toast.error(res.error ?? "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {mode === "signin" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in to track orders, earn points and claim rewards."
              : mode === "forgot"
                ? "Enter the email you signed up with and we'll send you a link to choose a new password."
                : "Join to earn points on every completed order and save your rewards."}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-1 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setForgotSent(null); }}
              className={cn("rounded-md py-2 text-sm font-medium transition", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <Label htmlFor="au-name">Name</Label>
              <Input id="au-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" autoComplete="name" required />
            </div>
          )}
          <div>
            <Label htmlFor="au-email">Email</Label>
            <Input id="au-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" inputMode="email" autoComplete="email" required />
          </div>
          {mode === "signup" && (
            <div>
              <Label htmlFor="au-phone">Phone</Label>
              <Input id="au-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1.5 h-11" inputMode="tel" autoComplete="tel" placeholder="07…" required />
            </div>
          )}
          {mode === "forgot" && forgotSent && <p className="rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">{forgotSent} Check your spam folder too.</p>}
          {mode !== "forgot" && <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="au-pass">Password</Label>
              {mode === "signin" && <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => { setMode("forgot"); setForgotSent(null); }}>Forgot password?</button>}
            </div>
            <Input id="au-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required />
            {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>}
          {mode === "signup" && referral && (
            <div>
              <Label htmlFor="au-ref">Friend&apos;s referral code <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="au-ref" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} className="mt-1.5 h-11 font-mono uppercase" autoComplete="off" maxLength={20} placeholder="e.g. MEIL-7Q2K" />
              {refCode && <p className="mt-1 text-xs text-muted-foreground">You get {gbpShort(referral.give)} off your first order (food {gbpShort(referral.minSpend)}+).</p>}
            </div>
          )}
          {mode === "signup" && (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} className="mt-0.5 size-4 accent-current" />
              <span>Email me offers and news. (Optional - you can unsubscribe any time. Order and booking emails are sent either way.)</span>
            </label>
          )}
          {reactivateBy && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
              <p>This account is deactivated. You can reactivate it until <b>{new Date(reactivateBy).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</b> - your points and rewards come back.</p>
              <Button type="button" className="mt-2 h-9" disabled={busy} onClick={async () => {
                setBusy(true);
                const r = await reactivate(email, password);
                setBusy(false);
                if (r.ok) { toast.success("Welcome back - your account is active again."); setReactivateBy(null); onOpenChange(false); setPassword(""); }
                else toast.error(r.error ?? "Could not reactivate.");
              }}>Reactivate my account</Button>
            </div>
          )}
          {mode === "signup" && <Turnstile siteKey={siteKey} onToken={setHumanToken} resetKey={resetKey} />}
          <Button type="submit" className="mt-2 h-12 text-base font-semibold" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "forgot" ? (forgotSent ? "Send again" : "Email me a reset link") : "Create account"}
          </Button>
          {mode === "forgot" && <button type="button" className="text-center text-sm text-muted-foreground underline" onClick={() => setMode("signin")}>Back to sign in</button>}
          {mode === "signup" && loyalty.welcomePoints > 0 && <p className="text-center text-xs text-muted-foreground">Includes {loyalty.welcomePoints} bonus points, added when your first order is completed.</p>}
          {mode === "signup" && <p className="text-center text-xs text-muted-foreground">By creating an account you agree to our <Link href="/legal/terms" className="underline hover:text-gold-ink">Terms</Link> and <Link href="/legal/promotions" className="underline hover:text-gold-ink">Promotion Terms</Link>. See our <Link href="/legal/privacy" className="underline hover:text-gold-ink">Privacy Policy</Link>.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
