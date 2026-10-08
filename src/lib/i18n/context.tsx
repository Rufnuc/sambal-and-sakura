"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, detectLocale, normalizeLocale, type Locale } from "./config";

interface I18nValue {
  locale: Locale;
  ready: boolean; // true once the real locale is resolved on the client
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function readCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  return m ? normalizeLocale(decodeURIComponent(m[1])) : null;
}
function writeCookie(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readCookie();
    const resolved = saved ?? detectLocale(navigator.languages ?? [navigator.language]);
    setLocaleState(resolved);
    setReady(true);
    if (!saved) writeCookie(resolved);
    document.documentElement.lang = resolved;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    writeCookie(l);
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<I18nValue>(() => ({ locale, ready, setLocale }), [locale, ready, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <LanguageProvider>");
  return ctx;
}
export function useLocale() { const { locale, setLocale, ready } = useI18n(); return { locale, setLocale, ready }; }
