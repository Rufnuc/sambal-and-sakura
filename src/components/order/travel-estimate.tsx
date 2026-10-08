"use client";

import { useState } from "react";
import { Navigation, Clock, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Travel { straightMiles: number; driveMiles: number; driveMins: number | null; prepMins: number; leaveInMins: number | null }

export function TravelEstimate({ fulfilment }: { fulfilment: "delivery" | "collection" }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [travel, setTravel] = useState<Travel | null>(null);
  const [msg, setMsg] = useState("");

  function check() {
    if (!("geolocation" in navigator)) { setState("error"); setMsg("Location isn't available on this device."); return; }
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(`/api/geo/travel?lat=${latitude}&lon=${longitude}`);
          const d = await r.json();
          if (!d.ok) throw new Error();
          setTravel(d); setState("done");
        } catch { setState("error"); setMsg("Couldn't work out the distance right now."); }
      },
      () => { setState("error"); setMsg("We couldn't get your location. You can still order as normal."); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  if (state === "idle") {
    return (
      <Button type="button" variant="outline" className="h-11 gap-2" onClick={check}>
        <Navigation className="size-4" /> {fulfilment === "collection" ? "How far am I? Best time to leave" : "How far away am I?"}
      </Button>
    );
  }
  if (state === "loading") {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking your distance…</div>;
  }
  if (state === "error") {
    return <p className="text-sm text-muted-foreground">{msg}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-gold-ink" /> ~{travel!.driveMiles} miles away</span>
        {travel!.driveMins !== null && <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-gold-ink" /> ~{travel!.driveMins} min drive</span>}
      </div>
      {fulfilment === "collection" && travel!.driveMins !== null && (
        <p className="mt-2 text-sm font-medium text-jade">
          {travel!.leaveInMins! <= 0
            ? `Food takes ~${travel!.prepMins} min - set off now and it'll be ready as you arrive.`
            : `Order now and leave in about ${travel!.leaveInMins} min to collect it fresh (~${travel!.prepMins} min prep).`}
        </p>
      )}
      {fulfilment === "delivery" && (
        <p className="mt-2 text-xs text-muted-foreground">Delivery ETA is shown with your postcode above.</p>
      )}
    </div>
  );
}
