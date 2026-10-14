"use client";

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

export function AuthDialog({
  open, onOpenChange, defaultMode = "signin",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultMode?: "signin" | "signup";
}) {
  const { login, register, reactivate } = useAuth();
  const { locale } = useLocale();
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
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

  // The bot check (only shown when it's switched on) protects sign-up from mass fake accounts.
  useEffect(() => {
    if (!open) return;
    fetch("/api/public-config").then((r) => r.json()).then((d) => setSiteKey(d.turnstileSiteKey ?? null)).catch(() => {});
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && siteKey && !humanToken) { toast.error("Please complete the security check."); return; }
    setBusy(true);
    const res = mode === "signin" ? await login(email, password) : await register(name, email, phone, password, humanToken, offers, locale);
    setBusy(false);
    if (res.deactivated && res.reactivateBy) { setReactivateBy(res.reactivateBy); return; }
    if (mode === "signup" && !res.ok) { setHumanToken(""); setResetKey((n) => n + 1); }
    if (res.ok) {
      toast.success(mode === "signin" ? "Welcome back!" : "Account created - welcome! Your 50 bonus points unlock with your first completed order.");
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
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in to track orders, earn points and claim rewards."
              : "Join to earn points on every completed order and save your rewards."}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-1 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
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
          <div>
            <Label htmlFor="au-pass">Password</Label>
            <Input id="au-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required />
            {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>}
          </div>
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
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {mode === "signup" && <p className="text-center text-xs text-muted-foreground">Includes 50 bonus points, added when your first order is completed.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
