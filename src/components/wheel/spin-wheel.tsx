"use client";

import { useState } from "react";
import { Sparkles, Gift, Clock, Ticket, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/account/auth-dialog";
import { WHEEL_PRIZES, type WheelPrize } from "@/lib/data/site";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

const COLORS: Record<WheelPrize["color"], { fill: string; text: string }> = {
  gold: { fill: "#d99a2b", text: "#221302" },
  red: { fill: "#c0362c", text: "#ffffff" },
  pink: { fill: "#e2869a", text: "#221302" },
  charcoal: { fill: "#2c2619", text: "#f3ecdd" },
};

const R = 150;
const C = 160;

function polar(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
}
function segmentPath(i: number, seg: number) {
  const p1 = polar(i * seg, R);
  const p2 = polar(i * seg + seg, R);
  return `M ${C} ${C} L ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y} Z`;
}

export function SpinWheel({ prizes = WHEEL_PRIZES }: { prizes?: WheelPrize[] }) {
  const { user, loaded, refresh } = useAuth();
  const N = prizes.length;
  const SEG = 360 / N;
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; kind: string; code?: string } | null>(null);
  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  async function spin() {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    setCooldownMsg(null);

    const res = await fetch("/api/wheel/spin", { method: "POST" });
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setSpinning(false);
      setCooldownMsg(data.error ?? "One spin a week - come back soon.");
      return;
    }
    if (!res.ok) {
      setSpinning(false);
      toast.error(data.error ?? "Could not spin.");
      return;
    }

    track("spin_wheel_played");
    const idx = Math.max(0, data.prizeIndex ?? 0);
    const jitter = (Math.random() - 0.5) * (SEG * 0.6);
    const target = 360 * 6 + (360 - (idx * SEG + SEG / 2)) - jitter;
    setRotation((prev) => prev - (prev % 360) + target);

    window.setTimeout(async () => {
      setSpinning(false);
      if (data.prize.kind === "none") {
        toast("So close! Come back next week for another spin.");
        setResult({ label: data.prize.label, kind: "none" });
      } else {
        setResult({ label: data.prize.label, kind: data.prize.kind, code: data.reward?.code });
        toast.success(`You won: ${data.prize.label}!`, { description: "Saved to your account rewards." });
      }
      setCooldownMsg("One spin a week - your next spin unlocks in 7 days.");
      await refresh();
    }, 4200);
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" aria-live="polite">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
          <div className="size-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-primary drop-shadow" />
        </div>
        <div
          className="rounded-full shadow-2xl ring-8 ring-sidebar"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none" }}
        >
          <svg viewBox="0 0 320 320" className="size-72 sm:size-80" role="img" aria-label="Fortune wheel">
            {prizes.map((p, i) => {
              const c = COLORS[p.color];
              const mid = i * SEG + SEG / 2;
              const lp = polar(mid, R * 0.62);
              return (
                <g key={p.id}>
                  <path d={segmentPath(i, SEG)} fill={c.fill} stroke="#15120d" strokeWidth="1.5" />
                  <text x={lp.x} y={lp.y} fill={c.text} fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid} ${lp.x} ${lp.y})`}>
                    {p.label}
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r="22" fill="#211d17" stroke="#d99a2b" strokeWidth="3" />
          </svg>
        </div>
      </div>

      <div className="mt-8 w-full max-w-md text-center">
        {!loaded ? (
          <div className="h-14 animate-pulse rounded-full bg-muted" />
        ) : !user ? (
          <>
            <Button className="h-14 w-full text-lg font-semibold" onClick={() => setAuthOpen(true)}>
              <LogIn className="size-5" /> Sign in to spin
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">One spin per account each week - sign in or create an account to play.</p>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode="signup" />
          </>
        ) : result ? (
          <ResultCard result={result} />
        ) : (
          <Button className="h-14 w-full text-lg font-semibold" onClick={spin} disabled={spinning}>
            <Sparkles className="size-5" /> {spinning ? "Spinning…" : "Crack the cookie - spin!"}
          </Button>
        )}
        {cooldownMsg && !spinning && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" /> {cooldownMsg}
          </p>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: { label: string; kind: string; code?: string } }) {
  if (result.kind === "none") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="font-display text-xl font-bold">So close!</p>
        <p className="mt-1 text-muted-foreground">No prize this time - your next spin unlocks in a week.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center shadow-sm">
      <Gift className="mx-auto size-8 text-primary" />
      <p className="mt-2 font-display text-2xl font-bold">You won {result.label}!</p>
      {result.code && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-background px-4 py-2 font-mono text-lg font-bold text-primary">
          <Ticket className="size-4" /> {result.code}
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">Saved to your account - enter this code at checkout within 7 days.</p>
    </div>
  );
}
