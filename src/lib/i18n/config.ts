export const LOCALES = ["en", "zh", "vi", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "ss_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  vi: "Tiếng Việt",
  ja: "日本語",
};

// Map a BCP-47 tag (navigator.language / Accept-Language) to a supported locale.
export function normalizeLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const t = tag.toLowerCase();
  if (t.startsWith("zh")) return "zh";
  if (t.startsWith("vi")) return "vi";
  if (t.startsWith("ja")) return "ja";
  if (t.startsWith("en")) return "en";
  return null;
}

// Pick the best supported locale from an ordered list of preferences.
export function detectLocale(prefs: readonly string[]): Locale {
  for (const p of prefs) {
    const loc = normalizeLocale(p);
    if (loc) return loc;
  }
  return DEFAULT_LOCALE;
}
