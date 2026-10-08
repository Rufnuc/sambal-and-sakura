import { createHash } from "node:crypto";
import { prisma } from "@/server/db";

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

const MAX_TEXTS = 128;
const MAX_LEN = 2000;

export async function translateBatch(rawTexts: string[], locale: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!isTargetLocale(locale)) return out; // English or unsupported → identity (caller keeps source)

  // Dedupe + bound.
  const texts = Array.from(new Set(rawTexts.map((t) => t.trim()).filter((t) => t && t.length <= MAX_LEN))).slice(0, 2000);
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

  const provider = pickProvider();
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
      } catch {
        for (const src of chunk) out[src] = src; // graceful: keep English on failure
      }
    }
  } else {
    for (const src of misses) out[src] = src; // no provider configured → English
  }

  return out;
}
