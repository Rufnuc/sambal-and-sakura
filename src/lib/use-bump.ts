"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True for a short moment each time `value` INCREASES (e.g. an item added to the cart).
 * Ignores the first value after hydration so a returning customer with items already in their
 * cart doesn't see the badge pop on page load.
 */
export function useBump(value: number, ready: boolean, ms = 450): boolean {
  const prev = useRef<number | null>(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (prev.current === null) { prev.current = value; return; }
    if (value > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), ms);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value, ready, ms]);

  return bump;
}
