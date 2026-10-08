"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-sambal/10 text-sambal">
        <AlertTriangle className="size-8" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold">This view failed to load</h1>
        <p className="mt-2 max-w-md text-muted-foreground">An error occurred in the operations console. Try again, or return to the dashboard.</p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
      <div className="flex gap-3">
        <Button className="h-11 px-6" onClick={reset}>Try again</Button>
        <Button asChild variant="outline" className="h-11 px-6"><Link href="/admin">Dashboard</Link></Button>
      </div>
    </div>
  );
}
