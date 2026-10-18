"use client";

import { useEffect, useState } from "react";
import { MENU, DEFAULT_CATEGORIES, type MenuItem, type MenuCategoryCfg } from "@/lib/data/menu";

export interface LiveMenu { menu: MenuItem[]; categories: MenuCategoryCfg[]; loaded: boolean }

// One fetch per page load, shared by every component that asks. Until it arrives (or if it fails) the
// built-in menu is used, so nothing renders empty.
let cache: Promise<{ menu: MenuItem[]; categories: MenuCategoryCfg[] }> | null = null;
function load() {
  cache ??= fetch("/api/menu", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .catch(() => { cache = null; return { menu: MENU, categories: DEFAULT_CATEGORIES }; });
  return cache;
}

/** The menu customers can order from now: the owner's added dishes in, hidden dishes and categories out. */
export function useMenu(): LiveMenu {
  const [state, setState] = useState<LiveMenu>({ menu: MENU, categories: DEFAULT_CATEGORIES, loaded: false });
  useEffect(() => {
    let live = true;
    load().then((d) => { if (live) setState({ ...d, loaded: true }); });
    return () => { live = false; };
  }, []);
  return state;
}
