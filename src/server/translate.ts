import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { log, alertOwner } from "@/server/log";

// Site-wide machine translation with a permanent DB cache.
// Each unique English string is translated once per locale, then reused forever,
// so after warm-up translation is instant and costs nothing.
//
// Provider is auto-selected from whatever is configured in .env (in priority order):
//   1. Google Cloud Translation v2 — GOOGLE_TRANSLATE_API_KEY  (cheapest + best coverage, 500k chars/mo free)
//   2. Microsoft Translator        — MICROSOFT_TRANSLATOR_KEY (+ optional MICROSOFT_TRANSLATOR_REGION)
//   3. LibreTranslate (free/OSS)   — LIBRETRANSLATE_URL (+ optional LIBRETRANSLATE_API_KEY); defaults to the public host
// If every provider fails, strings fall back to English so the site never breaks.

export type TargetLocale = "zh" | "vi" | "ja";
export const TRANSLATABLE: readonly TargetLocale[] = ["zh", "vi", "ja"];
export const isTargetLocale = (l: string): l is TargetLocale => (TRANSLATABLE as readonly string[]).includes(l);

const hashOf = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/* --------------------------------------------------------------- providers */

type ProviderFn = (texts: string[], locale: TargetLocale) => Promise<string[]>;

const GOOGLE: Record<TargetLocale, string> = { zh: "zh-CN", vi: "vi", ja: "ja" };
const MS: Record<TargetLocale, string> = { zh: "zh-Hans", vi: "vi", ja: "ja" };

async function google(texts: string[], locale: TargetLocale): Promise<string[]> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY!;
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, source: "en", target: GOOGLE[locale], format: "text" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google Translate ${res.status}`);
  const data = await res.json();
  return (data.data.translations as { translatedText: string }[]).map((t) => t.translatedText);
}

async function microsoft(texts: string[], locale: TargetLocale): Promise<string[]> {
  const key = process.env.MICROSOFT_TRANSLATOR_KEY!;
  const region = process.env.MICROSOFT_TRANSLATOR_REGION;
  const res = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=${MS[locale]}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
      ...(region ? { "Ocp-Apim-Subscription-Region": region } : {}),
    },
    body: JSON.stringify(texts.map((Text) => ({ Text }))),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`MS Translator ${res.status}`);
  const data = (await res.json()) as { translations: { text: string }[] }[];
  return data.map((d) => d.translations[0]?.text ?? "");
}

async function libre(texts: string[], locale: TargetLocale): Promise<string[]> {
  const base = (process.env.LIBRETRANSLATE_URL || "https://libretranslate.com").replace(/\/$/, "");
  const apiKey = process.env.LIBRETRANSLATE_API_KEY;
  // LibreTranslate accepts an array for `q` and returns an array of translations.
  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, source: "en", target: locale, format: "text", ...(apiKey ? { api_key: apiKey } : {}) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const data = await res.json();
  const out = data.translatedText;
  if (Array.isArray(out)) return out as string[];
  return [String(out)]; // single-string fallback
}

function pickProvider(): ProviderFn | null {
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return google;
  if (process.env.MICROSOFT_TRANSLATOR_KEY) return microsoft;
  if (process.env.LIBRETRANSLATE_URL || process.env.LIBRETRANSLATE_PUBLIC === "1") return libre;
  return null;
}
export const translationConfigured = () => pickProvider() !== null;

/* --------------------------------------------------------------- batch API */

const MAX_TEXTS = 128;          // per provider call
export const MAX_LEN = 1500;     // longest single string we translate (a long FAQ answer)
export const MAX_STRINGS = 300;  // per request
export const MAX_CHARS = 30_000; // per request
// Daily ceiling on characters sent to the paid provider (cache misses only). Protects the bill if
// someone floods the endpoint with made-up text. Override with TRANSLATE_DAILY_CHAR_BUDGET.
const DAILY_BUDGET = Number(process.env.TRANSLATE_DAILY_CHAR_BUDGET) || 200_000;

// Things that look like personal data are never sent to the provider or stored in the shared cache
// (names on an account page are protected by translate="no"; this is the safety net).
const PERSONAL = [
  /[\w.+-]+@[\w-]+\.[\w.]+/,                        // email
  /(?:\+?44|0)\s?\d(?:[\s-]?\d){8,10}/,               // UK phone
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i,            // UK postcode
  /\b(?:SS|BK)-[A-Z0-9]{5,6}\b/,                       // order / booking reference
];
export const looksPersonal = (s: string) => PERSONAL.some((re) => re.test(s));

/** Translations already in the cache (no paid API call). Missing ones are simply left out. */
export async function cachedTranslations(texts: string[], locale: string): Promise<Record<string, string>> {
  if (!isTargetLocale(locale) || !texts.length) return {};
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  const rows = await prisma.translation.findMany({ where: { locale, hash: { in: unique.map(hashOf) } } });
  const byHash = new Map(rows.map((r) => [r.hash, r.value]));
  const out: Record<string, string> = {};
  for (const t of unique) { const v = byHash.get(hashOf(t)); if (v) out[t] = v; }
  return out;
}

export async function translateBatch(rawTexts: string[], locale: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!isTargetLocale(locale)) return out; // English or unsupported → identity (caller keeps source)

  // Dedupe + bound (count and total size).
  let chars = 0;
  const texts: string[] = [];
  for (const t of new Set(rawTexts.map((x) => x.trim()))) {
    if (!t || t.length > MAX_LEN) continue;
    if (looksPersonal(t)) { out[t] = t; continue; }
    if (texts.length >= MAX_STRINGS || chars + t.length > MAX_CHARS) break;
    texts.push(t);
    chars += t.length;
  }
  if (texts.length === 0) return out;

  const hashes = texts.map(hashOf);
  const cached = await prisma.translation.findMany({ where: { locale, hash: { in: hashes } } });
  const byHash = new Map(cached.map((c) => [c.hash, c.value]));

  const misses: string[] = [];
  texts.forEach((t, i) => {
    const hit = byHash.get(hashes[i]);
    if (hit !== undefined) out[t] = hit;
    else misses.push(t);
  });

  let provider = pickProvider();
  if (misses.length && provider) {
    const missChars = misses.reduce((n, t) => n + t.length, 0);
    const today = new Date().toISOString().slice(0, 10);
    // Characters sent to the provider today (a counter row that expires after two days).
    const budget = await prisma.rateLimit.upsert({
      where: { key: `translate-budget:${today}` },
      create: { key: `translate-budget:${today}`, count: missChars, expiresAt: new Date(Date.now() + 2 * 86400000) },
      update: { count: { increment: missChars } },
      select: { count: true },
    }).catch(() => null);
    if (budget && budget.count > DAILY_BUDGET) {
      log.warn("translate_budget_exhausted", { used: budget.count, budget: DAILY_BUDGET });
      void alertOwner("translate-budget", `Translation daily limit reached (${budget.count.toLocaleString()} characters). New text shows in English until tomorrow. If this is unexpected, someone may be abusing the site.`);
      provider = null;
    }
  }
  if (misses.length && provider) {
    for (let i = 0; i < misses.length; i += MAX_TEXTS) {
      const chunk = misses.slice(i, i + MAX_TEXTS);
      try {
        const translated = await provider(chunk, locale);
        const rows = chunk.map((src, j) => ({ src, value: translated[j] ?? src }));
        // Upsert each row (race-safe; SQLite createMany has no skipDuplicates).
        await Promise.all(rows.map((r) => {
          const hash = hashOf(r.src);
          return prisma.translation.upsert({
            where: { locale_hash: { locale, hash } },
            update: {},
            create: { locale, hash, source: r.src, value: r.value },
          }).catch(() => undefined);
        }));
        for (const r of rows) out[r.src] = r.value;
      } catch (e) {
        log.error("translate_provider_failed", { locale, error: (e as Error).message?.slice(0, 200) });
        for (const src of chunk) out[src] = src; // graceful: keep English on failure
      }
    }
  } else {
    for (const src of misses) out[src] = src; // no provider configured → English
  }

  return out;
}
