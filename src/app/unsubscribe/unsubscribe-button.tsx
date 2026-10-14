"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UnsubscribeButton({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p className="font-medium text-jade">Done - you won&apos;t get offer emails from us any more.</p>;
  return (
    <>
      <Button className="h-11 px-6" disabled={state === "busy" || !u || !t} onClick={async () => {
        setState("busy");
        const r = await fetch(`/api/marketing/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`, { method: "POST" });
        setState(r.ok ? "done" : "error");
      }}>
        {state === "busy" ? "Please wait…" : "Unsubscribe"}
      </Button>
      {state === "error" && <p className="text-sm text-sambal">This link isn&apos;t valid. You can also turn offers off in your account.</p>}
    </>
  );
}
