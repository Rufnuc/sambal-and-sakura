"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail, Paperclip, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Turnstile } from "@/components/turnstile";

const MAX_MB = 4;
const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** "Apply" on the Careers page: a short form + CV upload, emailed to the restaurant (POST /api/careers/apply). */
export function ApplyDialog({ jobId, jobTitle, fallbackEmail, label = "Apply" }: { jobId?: string; jobTitle?: string; fallbackEmail: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/public-config").then((r) => r.json()).then((d) => setSiteKey(d.turnstileSiteKey ?? null)).catch(() => {});
  }, [open]);

  function pick(f: File | null) {
    setError("");
    if (f && f.size > MAX_MB * 1024 * 1024) { setFile(null); setError(`That file is too big - please choose a CV under ${MAX_MB} MB.`); return; }
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!file) { setError("Please attach your CV."); return; }
    if (!consent) { setError("Please tick the box to confirm you've read how we use your application."); return; }
    const fd = new FormData(e.currentTarget);
    fd.set("cv", file);
    fd.set("consent", "yes");
    if (jobId) fd.set("jobId", jobId);
    if (token) fd.set("turnstileToken", token);
    setBusy(true);
    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Sorry, something went wrong. Please try again."); setResetKey((k) => k + 1); return; }
      setSent(true);
    } catch {
      setError(`Couldn't send - check your connection, or email your CV to ${fallbackEmail}.`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSent(false); setError(""); } }}>
      <DialogTrigger className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/80">
        <Mail className="size-4" /> {label}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{jobTitle ? `Apply: ${jobTitle}` : "Send us your CV"}</DialogTitle>
          <DialogDescription>Your CV goes straight to our team by email. We reply to everyone we&apos;d like to meet.</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-12 text-jade" />
            <p className="font-display text-xl font-bold">Application sent</p>
            <p className="text-sm text-muted-foreground">Thank you! We&apos;ve emailed you a confirmation and we&apos;ll be in touch if it&apos;s a good fit.</p>
            <Button variant="outline" className="mt-2" onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div><Label htmlFor="cv-name">Full name</Label><Input id="cv-name" name="name" required minLength={2} maxLength={80} autoComplete="name" className="mt-1 h-11" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="cv-email">Email</Label><Input id="cv-email" name="email" type="email" required maxLength={160} autoComplete="email" className="mt-1 h-11" /></div>
              <div><Label htmlFor="cv-phone">Phone</Label><Input id="cv-phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" className="mt-1 h-11" /></div>
            </div>
            <div>
              <Label htmlFor="cv-file">CV (PDF or Word, up to {MAX_MB} MB)</Label>
              <input ref={fileRef} id="cv-file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 flex h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-left text-sm hover:bg-muted">
                <Paperclip className="size-4 shrink-0 text-gold-ink" />
                <span className="truncate">{file ? file.name : "Choose a file…"}</span>
                {file && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
              </button>
            </div>
            <div><Label htmlFor="cv-message">Message (optional)</Label><Textarea id="cv-message" name="message" maxLength={1500} rows={3} placeholder="Availability, experience, anything you'd like us to know" className="mt-1" /></div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
              <span>I understand my application and CV will be emailed to the restaurant and kept for up to 6 months, as explained in the <Link href="/legal/privacy" className="font-medium text-gold-ink underline" target="_blank">Privacy Policy</Link>.</span>
            </label>
            <Turnstile siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
            {error && <p role="alert" className="rounded-lg bg-sambal/10 px-3 py-2 text-sm text-sambal">{error}</p>}
            <Button type="submit" className="h-12 text-base font-semibold" disabled={busy}>{busy ? "Sending…" : "Send application"}</Button>
            <p className="text-center text-xs text-muted-foreground">Prefer email? Send your CV to <a href={`mailto:${fallbackEmail}`} className="underline">{fallbackEmail}</a>.</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
