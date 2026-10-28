"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo";

export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Sign-in failed."); setBusy(false); return; }
    if (data.user?.role !== "staff" && data.user?.role !== "admin") {
      setError("This account doesn't have operations access.");
      await fetch("/api/auth/logout", { method: "POST" });
      setBusy(false); return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar px-6 text-sidebar-foreground">
      <div className="flex items-center gap-3">
        <LogoMark className="size-10" />
        <div className="leading-tight">
          <p className="font-display text-lg font-bold">Sambal &amp; Sakura</p>
          <p className="text-sm text-sidebar-foreground/60">Operations</p>
        </div>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-6">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold"><Lock className="size-5 text-gold-ink" /> Staff sign-in</h1>
        <div className="mt-4">
          <Label htmlFor="s-email">Email</Label>
          <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11 bg-background text-foreground" autoComplete="username" required />
        </div>
        <div className="mt-3">
          <Label htmlFor="s-pass">Password</Label>
          <Input id="s-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11 bg-background text-foreground" autoComplete="current-password" required />
        </div>
        {error && <p className="mt-3 text-sm text-[color:var(--sambal)]">{error}</p>}
        <Button type="submit" className="mt-5 h-12 w-full font-semibold" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        {/* No reset-by-email for staff on purpose: someone who got into a staff inbox could take over the admin. */}
        <p className="mt-3 text-center text-xs text-muted-foreground">Forgot your password? Ask the owner to reset it in Admin → Staff.</p>
        <p className="mt-3 text-center text-xs text-sidebar-foreground/50">Authorised staff only.</p>
      </form>
    </main>
  );
}
