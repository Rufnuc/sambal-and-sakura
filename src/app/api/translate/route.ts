import { NextResponse } from "next/server";
import { translateBatch } from "@/server/translate";

// Batch-translate English UI strings into the requested locale. Results are
// cached in the DB, so repeat calls for the same strings are instant.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const locale = typeof body?.locale === "string" ? body.locale : "";
  const texts = Array.isArray(body?.texts) ? body.texts.filter((t: unknown): t is string => typeof t === "string") : [];
  if (!locale || texts.length === 0) return NextResponse.json({ map: {} });

  const map = await translateBatch(texts.slice(0, 2000), locale);
  return NextResponse.json({ map });
}
