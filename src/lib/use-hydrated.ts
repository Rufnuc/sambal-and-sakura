"use client";

import { useEffect, useState } from "react";

/** True after the first client render - use to gate persisted (localStorage) state
 *  so server and first client render match and avoid hydration mismatch. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
