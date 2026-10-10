import { NextResponse } from "next/server";
import { turnstileSiteKey } from "@/server/turnstile";

// Public, non-secret settings the browser needs (e.g. the bot-check site key, which is meant to be public).
export async function GET() {
  return NextResponse.json({ turnstileSiteKey: turnstileSiteKey() });
}
