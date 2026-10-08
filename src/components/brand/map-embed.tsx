"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConsent } from "@/lib/consent";
import { cn } from "@/lib/utils";

/** Google Maps iframe gated behind cookie consent (GDPR). Renders a placeholder
 *  until the viewer accepts cookies or explicitly loads the map. */
export function MapEmbed({ query, className, title = "Map" }: { query: string; className?: string; title?: string }) {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    const sync = () => setLoad(getConsent() === "accepted");
    sync();
    window.addEventListener("ss:consent", sync);
    return () => window.removeEventListener("ss:consent", sync);
  }, []);

  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;

  if (load) {
    return (
      <iframe
        title={title}
        src={src}
        loading="lazy"
        className={cn("w-full", className)}
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center", className)}>
      <MapPin className="size-7 text-gold-ink" />
      <p className="max-w-xs text-sm text-muted-foreground">
        The map loads from Google Maps, which may set cookies. Load it to see where we are.
      </p>
      <Button variant="secondary" className="h-10" onClick={() => setLoad(true)}>Load map</Button>
    </div>
  );
}
