"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2, Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/store/auth";

function makeCode(seed: string) {
  const base = seed.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "SAKURA";
  const n = Math.floor(100 + Math.random() * 900);
  return `${base}${n}`;
}

export function ReferralWidget() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("SAKURA123");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (user) { setCode(user.referralCode); setName(user.name.split(" ")[0]); return; }
    try {
      const saved = window.localStorage.getItem("ss_referral");
      if (saved) setCode(saved);
    } catch { /* ignore */ }
  }, [user]);

  function generate() {
    const c = makeCode(name);
    setCode(c);
    try { window.localStorage.setItem("ss_referral", c); } catch { /* ignore */ }
    toast.success("Your referral code is ready!");
  }

  const link = `${origin}/order?ref=${code}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch { toast.error("Couldn't copy."); }
  }

  async function share() {
    const shareData = { title: "Sambal & Sakura", text: `Get £5 off your first order at Sambal & Sakura with my code ${code}`, url: link };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await copy(link);
    } catch { /* user cancelled */ }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Gift className="size-5 text-sambal" />
        <h2 className="font-display text-xl font-bold">Your referral link</h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="refname">Your first name</Label>
          <Input id="refname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mei" className="mt-1.5 h-11" autoComplete="given-name" />
        </div>
        <Button className="h-11" onClick={generate}>Generate my code</Button>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Your code</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-bold text-primary">{code}</span>
          <Button variant="outline" size="sm" className="h-9" onClick={() => copy(code)}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={link} className="h-11 text-sm text-muted-foreground" aria-label="Referral link" />
        <Button variant="secondary" className="h-11 gap-2" onClick={share}><Share2 className="size-4" /> Share</Button>
      </div>
    </div>
  );
}
