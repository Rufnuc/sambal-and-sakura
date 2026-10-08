"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success(`Code ${code} copied`);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Couldn't copy - select it manually.");
        }
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 font-mono text-sm font-semibold text-gold-ink transition hover:bg-primary/10",
        className,
      )}
      aria-label={`Copy code ${code}`}
    >
      {code}
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}
