"use client";

import type { AnalyticsEvent } from "@/lib/data/site";
import { getConsent } from "@/lib/consent";

/**
 * First-party analytics: events go to our own server (/api/events) and appear in Admin → Analytics.
 * Nothing is sent unless the visitor has accepted analytics cookies, and no personal details are
 * sent (the server also strips anything that looks like a name, phone, email or address).
 */
export function track(name: AnalyticsEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined" || getConsent() !== "accepted") return;
  try {
    const body = JSON.stringify({ name, props });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) {
      void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics is best-effort */
  }
}
