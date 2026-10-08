"use client";

import type { AnalyticsEvent } from "@/lib/data/site";

/**
 * Lightweight analytics shim. In production, swap the `sink` for GA4 / Segment /
 * a server endpoint. Events are also mirrored to a session buffer the admin
 * "Analytics" view can read, so the demo shows live event flow.
 */
const BUFFER_KEY = "ss_events";

export interface TrackedEvent {
  name: AnalyticsEvent;
  props?: Record<string, unknown>;
  ts: number;
}

export function track(name: AnalyticsEvent, props?: Record<string, unknown>) {
  const evt: TrackedEvent = { name, props, ts: Date.now() };
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.debug("[analytics]", name, props ?? {});
  try {
    const raw = window.localStorage.getItem(BUFFER_KEY);
    const list: TrackedEvent[] = raw ? JSON.parse(raw) : [];
    list.push(evt);
    // keep last 200
    window.localStorage.setItem(BUFFER_KEY, JSON.stringify(list.slice(-200)));
    window.dispatchEvent(new CustomEvent("ss:event", { detail: evt }));
  } catch {
    /* storage unavailable - analytics is best-effort */
  }
}

export function readEvents(): TrackedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}
