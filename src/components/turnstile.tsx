"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile "are you human" check. Renders nothing when no site key is configured.
// Usually invisible; sometimes shows a one-click box. Calls onToken with a fresh token (or "" when it expires).

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken, resetKey = 0 }: { siteKey: string | null | undefined; onToken: (t: string) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(""),
        "error-callback": () => cb.current(""),
        appearance: "interaction-only",
      });
    }).catch(() => cb.current(""));
    return () => { cancelled = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, resetKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="mt-3 flex justify-center" />;
}
