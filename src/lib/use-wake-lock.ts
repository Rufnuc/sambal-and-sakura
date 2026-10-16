"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Sentinel = { release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };

const noSubscribe = () => () => {};
/** Hydration-safe "does this browser support it" (false while server-rendering). */
const useWakeLockSupported = () => useSyncExternalStore(noSubscribe, () => "wakeLock" in navigator, () => false);

/**
 * Keeps the screen on while `enabled` (Screen Wake Lock API). Browsers drop the lock when the tab is
 * hidden or the device locks, so it is taken again whenever the page becomes visible.
 * Returns "on" | "off" | "unsupported".
 */
export function useWakeLock(enabled: boolean): "on" | "off" | "unsupported" {
  const supported = useWakeLockSupported();
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!supported || !enabled) return;
    const nav = navigator as WakeLockNav;
    let lock: Sentinel | null = null;
    let stopped = false;
    const take = async () => {
      if (stopped || lock || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock!.request("screen");
        setHeld(true);
        lock.addEventListener("release", () => { lock = null; setHeld(false); });
      } catch { setHeld(false); } // e.g. battery saver, or not allowed yet
    };
    void take();
    const onVis = () => { if (document.visibilityState === "visible") void take(); };
    document.addEventListener("visibilitychange", onVis);
    // Some browsers only allow it after a tap on the page: try again on every tap until it's held.
    document.addEventListener("pointerdown", onVis);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerdown", onVis);
      void lock?.release().catch(() => {});
    };
  }, [enabled, supported]);
  if (!supported) return "unsupported";
  return enabled && held ? "on" : "off";
}
