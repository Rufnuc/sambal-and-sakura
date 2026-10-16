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

/** "Cookie settings": forget the choice and show the banner again (withdrawing is as easy as giving). */
export function reopenConsent() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("ss:consent", { detail: null }));
    window.dispatchEvent(new Event("ss:consent-open"));
  } catch { /* ignore */ }
}
