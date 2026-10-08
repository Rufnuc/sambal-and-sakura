"use client";

import { useEffect, useState } from "react";
import { getOpenState, type OpenState } from "@/lib/hours";
import { useSiteContent } from "@/components/site-content-provider";
import { cn } from "@/lib/utils";

export function OpenStatus({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [state, setState] = useState<OpenState | null>(null);
  const hours = useSiteContent().business.hours;

  useEffect(() => {
    const update = () => setState(getOpenState(hours));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [hours]);

  if (!state) {
    return <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)} />;
  }

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span className="relative flex size-2.5">
        {state.open && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-jade opacity-70" />
        )}
        <span className={cn("relative inline-flex size-2.5 rounded-full", state.open ? "bg-jade" : "bg-muted-foreground")} />
      </span>
      <span className={state.open ? "text-foreground" : "text-muted-foreground"}>
        {compact ? (state.open ? "Open now" : "Closed") : state.label}
      </span>
    </span>
  );
}
