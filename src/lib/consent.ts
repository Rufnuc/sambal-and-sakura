"use client";

export type Consent = "accepted" | "declined" | null;
const KEY = "ss_consent";

export function getConsent(): Consent {
  if (typeof window === "undefined") return null;
  try { return (window.localStorage.getItem(KEY) as Consent) ?? null; } catch { return null; }
}

export function setConsent(v: Exclude<Consent, null>) {
  try {
    window.localStorage.setItem(KEY, v);
    window.dispatchEvent(new CustomEvent("ss:consent", { detail: v }));
  } catch { /* ignore */ }
}
