"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production, forward to your error reporting (Sentry, etc.)
    console.error("Site error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-sambal/10 text-sambal">
        <AlertTriangle className="size-8" />
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">
          We hit a snag loading this page. Please try again - if it keeps happening, give us a call and we'll take your order directly.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button className="h-12 px-6 font-semibold" onClick={reset}>Try again</Button>
        <Button asChild variant="outline" className="h-12 px-6"><Link href="/">Back home</Link></Button>
      </div>
    </div>
  );
}
