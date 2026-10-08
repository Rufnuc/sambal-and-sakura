"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConsent, setConsent } from "@/lib/consent";

export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => { setShow(getConsent() === null); }, []);

  if (!show) return null;

  function choose(v: "accepted" | "declined") {
    setConsent(v);
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4" role="dialog" aria-label="Cookie consent">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl sm:flex-row sm:items-center">
        <Cookie className="size-6 shrink-0 text-gold-ink" />
        <p className="flex-1 text-sm text-muted-foreground">
          We use essential cookies to run the site. With your consent we also load Google Maps to show our location.
          See our <Link href="/legal/privacy" className="font-medium text-gold-ink hover:underline">Privacy Policy</Link>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-10" onClick={() => choose("declined")}>Decline</Button>
          <Button className="h-10 font-semibold" onClick={() => choose("accepted")}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
