import { NextResponse } from "next/server";
import { translateBatch, MAX_STRINGS } from "@/server/translate";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { cleanText } from "@/server/sanitize";

// Batch-translate English UI strings into the requested locale. Results are cached in the DB, so
// repeat calls for the same strings are instant. Bounded per request, per visitor and per day
// (see server/translate.ts), so it can't be used to run up the translation bill.
export async function POST(req: Request) {
  const limited = await limitOr429([{ name: "translate-ip", id: clientIp(req), limit: 120, windowSec: 600 }]);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const locale = typeof body?.locale === "string" ? body.locale : "";
  // Page text sent by the browser: control/invisible characters stripped before it's sent on or cached.
  const raw: string[] = Array.isArray(body?.texts) ? body.texts.slice(0, MAX_STRINGS).filter((t: unknown): t is string => typeof t === "string") : [];
  const texts = raw.map((t) => ({ t, c: cleanText(t, { multiline: true }) })).filter((x) => x.c === x.t.trim()).map((x) => x.t);
  if (!locale || texts.length === 0) return NextResponse.json({ map: {} });

  const map = await translateBatch(texts, locale);
  return NextResponse.json({ map });
}
