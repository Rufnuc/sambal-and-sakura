"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/lib/i18n/context";
import { CURATED } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

// Site-wide auto-translation. Translates every visible English text node (and a
// few key attributes) into the active locale, in place, caching each unique
// string so it's instant afterwards. New/async content is picked up via a
// MutationObserver. English is the source of truth; switching to English
// restores the originals. Mark anything that must stay verbatim (e.g. the brand
// name) with translate="no" or class "notranslate".
//
// Source tracking (English per node) is PERSISTENT across language changes, so
// switching zh -> vi translates from the original English, never from the
// already-translated text.

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const HAS_LETTER = /\p{L}/u;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);

function translatable(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 2000 && HAS_LETTER.test(t);
}

function isSkipped(node: Node): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.getAttribute?.("translate") === "no") return true;
    if (el.classList?.contains("notranslate")) return true;
    if (el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

export function AutoTranslator() {
  const { locale } = useLocale();

  // Persistent across locale changes:
  const textEn = useRef(new WeakMap<Text, string>());                  // text node -> English source
  const attrEn = useRef(new WeakMap<Element, Record<string, string>>()); // element -> { attr: English }
  const allTranslated = useRef(new Set<string>());                     // every translated value we've produced (any locale)
  const caches = useRef(new Map<Locale, Map<string, string>>());       // locale -> (English -> translated)

  function cacheFor(loc: Locale): Map<string, string> {
    let c = caches.current.get(loc);
    if (!c) {
      c = new Map<string, string>(Object.entries(CURATED[loc] ?? {}));
      if (loc !== "en") {
        try {
          const saved = JSON.parse(localStorage.getItem(`ss_tr_${loc}`) || "{}") as Record<string, string>;
          for (const [k, v] of Object.entries(saved)) if (!c.has(k)) c.set(k, v);
        } catch { /* ignore */ }
      }
      for (const v of c.values()) allTranslated.current.add(v);
      caches.current.set(loc, c);
    }
    return c;
  }

  useEffect(() => {
    if (typeof document === "undefined") return;

    const cache = cacheFor(locale);
    const pending = new Set<string>();
    let observer: MutationObserver | null = null;
    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    const reapplyTimers: ReturnType<typeof setTimeout>[] = [];
    let disposed = false;

    /* -------- resolve the English source for a text node (persistent + React-safe) */
    function sourceOf(node: Text): string {
      const val = node.nodeValue ?? "";
      const known = textEn.current.get(node);
      if (known === undefined) { textEn.current.set(node, val); return val; }
      if (val === known) return known;                        // unchanged / React reset to English
      if (allTranslated.current.has(val.trim())) return known; // it's a translation (this or another locale)
      textEn.current.set(node, val);                          // genuinely new English content
      return val;
    }

    function apply(root: Node) {
      if (!root || isSkipped(root)) return;
      const nodes: Text[] = [];
      if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
      else {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n = walker.nextNode();
        while (n) { nodes.push(n as Text); n = walker.nextNode(); }
      }

      for (const node of nodes) {
        if (isSkipped(node)) continue;
        const en = sourceOf(node);
        if (locale === "en") { if (node.nodeValue !== en) node.nodeValue = en; continue; }
        if (!translatable(en)) continue;
        const key = en.trim();
        const hit = cache.get(key);
        if (hit !== undefined && hit !== key) {
          const replaced = en.replace(key, hit);              // keep surrounding whitespace
          if (node.nodeValue !== replaced) node.nodeValue = replaced;
        } else if (hit === undefined) {
          pending.add(key);
        }
      }

      // Attributes (placeholder / aria-label / title / alt)
      const elRoot: Element | null =
        root.nodeType === Node.ELEMENT_NODE ? (root as Element) : (root.parentElement ?? null);
      if (elRoot) {
        const els = [elRoot, ...Array.from(elRoot.querySelectorAll<HTMLElement>("*"))];
        for (const el of els) {
          if (isSkipped(el)) continue;
          for (const attr of ATTRS) {
            if (!el.hasAttribute(attr)) continue;
            const cur = el.getAttribute(attr) ?? "";
            const rec = attrEn.current.get(el) ?? {};
            let en = rec[attr];
            if (en === undefined) { en = cur; rec[attr] = cur; attrEn.current.set(el, rec); }
            else if (cur !== en && !allTranslated.current.has(cur.trim())) { en = cur; rec[attr] = cur; attrEn.current.set(el, rec); }
            if (locale === "en") { if (cur !== en) el.setAttribute(attr, en); continue; }
            if (!translatable(en)) continue;
            const hit = cache.get(en.trim());
            if (hit !== undefined && hit !== en.trim()) { if (cur !== hit) el.setAttribute(attr, hit); }
            else if (hit === undefined) pending.add(en.trim());
          }
        }
      }
    }

    function connect() {
      observer?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    }

    function run(root: Node) {
      observer?.disconnect();
      apply(root);
      connect();
      scheduleFetch();
    }

    function scheduleFetch() {
      if (locale === "en" || pending.size === 0) return;
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = setTimeout(flush, 60);
    }

    async function flush() {
      if (disposed || locale === "en" || pending.size === 0) return;
      const batch = Array.from(pending);
      pending.clear();
      try {
        const res = await fetch("/api/translate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale, texts: batch }),
        });
        const data = await res.json().catch(() => ({ map: {} }));
        const map = (data.map ?? {}) as Record<string, string>;
        let got = false;
        for (const [en, tr] of Object.entries(map)) {
          cache.set(en, tr || en);
          if (tr && tr !== en) { allTranslated.current.add(tr); got = true; }
        }
        if (got) {
          try {
            const persist: Record<string, string> = {};
            for (const [k, v] of cache) if (v !== k) persist[k] = v;
            localStorage.setItem(`ss_tr_${locale}`, JSON.stringify(persist));
          } catch { /* quota */ }
          if (!disposed) run(document.body);
        }
      } catch { /* offline — keep English */ }
    }

    observer = new MutationObserver((mutations) => {
      if (disposed) return;
      observer?.disconnect();
      for (const m of mutations) {
        if (m.type === "characterData") apply(m.target);
        else if (m.type === "attributes") apply(m.target);
        else m.addedNodes.forEach((node) => apply(node));
      }
      connect();
      scheduleFetch();
    });

    run(document.body);
    // Re-scan a few times to catch content that hydrates/animates in after first paint,
    // so auto-detected / switched languages apply without needing a manual refresh.
    for (const d of [250, 800, 1800]) reapplyTimers.push(setTimeout(() => { if (!disposed) run(document.body); }, d));

    return () => {
      disposed = true;
      if (fetchTimer) clearTimeout(fetchTimer);
      reapplyTimers.forEach(clearTimeout);
      observer?.disconnect();
    };
  }, [locale]);

  return null;
}
