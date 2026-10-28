"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/store/auth";

/** The token is after "#t=" in the emailed link. Read it once, then take it out of the address bar and history. */
function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = not read yet
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (t) window.history.replaceState(null, "", window.location.pathname);
    setToken(t); // eslint-disable-line react-hooks/set-state-in-effect -- the hash only exists in the browser
  }, []);
  return token;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-16 sm:px-6">{children}</div>;
}
function Problem({ text }: { text: string }) {
  return <p className="mt-4 flex items-start gap-2 rounded-lg bg-sambal/10 px-3 py-2 text-sm text-sambal"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {text}</p>;
}

export function VerifyEmail() {
  const token = useLinkToken();
  const refresh = useAuth((s) => s.refresh);
  const [state, setState] = useState<{ ok: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (token === undefined) return;
    if (!token) { setState({ ok: false, error: "This link isn't complete. Please open it from the email again." }); return; } // eslint-disable-line react-hooks/set-state-in-effect
    fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
      .then((d) => { setState({ ok: d.ok, error: d.error }); if (d.ok) void refresh(); })
      .catch(() => setState({ ok: false, error: "Couldn't reach us. Check your connection and open the link again." }));
  }, [token, refresh]);

  return (
    <Shell>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Confirm your email</h1>
      {!state && <p className="mt-4 text-muted-foreground">Checking your link…</p>}
      {state?.ok && (
        <>
          <p className="mt-4 flex items-center gap-2 text-jade"><CheckCircle2 className="size-5" /> Thanks - your email is confirmed.</p>
          <div className="mt-6 flex gap-3"><Button asChild className="h-11"><Link href="/menu">Order now</Link></Button><Button asChild variant="outline" className="h-11"><Link href="/account">Your account</Link></Button></div>
        </>
      )}
      {state && !state.ok && <Problem text={state.error ?? "That link didn't work."} />}
    </Shell>
  );
}

export function ResetPassword() {
  const token = useLinkToken();
  const refresh = useAuth((s) => s.refresh);
  const [valid, setValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ signedIn: boolean } | null>(null);

  useEffect(() => {
    if (token === undefined) return;
    if (!token) { setValid(false); setError("This link isn't complete. Please open it from the email again."); return; } // eslint-disable-line react-hooks/set-state-in-effect
    fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); setValid(r.ok); if (!r.ok) setError(d.error ?? "That link didn't work."); })
      .catch(() => { setValid(false); setError("Couldn't reach us. Check your connection and open the link again."); });
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.again) { setError("The two passwords don't match."); return; }
    setBusy(true); setError(null);
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw.next }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Could not change your password."); return; }
    setDone({ signedIn: !!d.signedIn });
    if (d.signedIn) void refresh();
  }

  return (
    <Shell>
      <h1 className="flex items-center gap-2 font-display text-3xl font-extrabold tracking-tight"><KeyRound className="size-7 text-gold-ink" /> New password</h1>
      {valid === null && <p className="mt-4 text-muted-foreground">Checking your link…</p>}
      {done ? (
        <>
          <p className="mt-4 flex items-center gap-2 text-jade"><CheckCircle2 className="size-5" /> Password changed. Every other device has been signed out.</p>
          <div className="mt-6 flex gap-3">
            {done.signedIn ? <Button asChild className="h-11"><Link href="/account">Your account</Link></Button> : <p className="text-sm text-muted-foreground">Sign in with your new password to reactivate your account.</p>}
            <Button asChild variant="outline" className="h-11"><Link href="/menu">Menu</Link></Button>
          </div>
        </>
      ) : valid && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <div><Label htmlFor="rp-new">New password (at least 8 characters)</Label><Input id="rp-new" type="password" minLength={8} maxLength={100} required autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="mt-1.5 h-11" /></div>
          <div><Label htmlFor="rp-again">Type it again</Label><Input id="rp-again" type="password" minLength={8} maxLength={100} required autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} className="mt-1.5 h-11" /></div>
          <Button type="submit" className="mt-2 h-12 text-base font-semibold" disabled={busy}>{busy ? "Please wait…" : "Save new password"}</Button>
        </form>
      )}
      {error && <Problem text={error} />}
    </Shell>
  );
}
