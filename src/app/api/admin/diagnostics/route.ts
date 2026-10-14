import { NextResponse } from "next/server";
import { adminUser } from "@/server/auth";
import { clientIp } from "@/server/rate-limit";
import { printerProvider } from "@/server/print";
import { wechatAvailable } from "@/server/wechat";
import { translationConfigured } from "@/server/translate";
import { turnstileSiteKey } from "@/server/turnstile";
import { prisma } from "@/server/db";

/** Postgres only: tables with Row Level Security switched off (should be none; see the indexes_and_rls migration). */
async function rlsOffTables(): Promise<string[] | "n/a (local SQLite)"> {
  if (!/^postgres/i.test(process.env.DATABASE_URL ?? "")) return "n/a (local SQLite)";
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity`;
  return rows.map((r) => r.name);
}

// Owner-only "Connection check": shows which IP the server thinks you have and the raw proxy
// headers, so you can confirm rate limits key on the real visitor (open it from your phone on
// 4G and from Wi-Fi: the detected IP should change). Lists which integrations are switched on.
// Never returns secret values.
export async function GET(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const h = req.headers;
  const pick = (k: string) => h.get(k) ?? null;
  return NextResponse.json({
    detectedIp: clientIp(req),
    clientIpHeaderSetting: process.env.CLIENT_IP_HEADER ?? null,
    headers: {
      "cf-connecting-ip": pick("cf-connecting-ip"),
      "true-client-ip": pick("true-client-ip"),
      "x-forwarded-for": pick("x-forwarded-for"),
      "x-real-ip": pick("x-real-ip"),
    },
    database: { rowLevelSecurityOff: await rlsOffTables().catch(() => "check failed") },
    integrations: {
      printer: printerProvider(),
      wechatPay: wechatAvailable(),
      translation: translationConfigured(),
      dishAssistant: Boolean(process.env.GROQ_API_KEY),
      botCheck: Boolean(turnstileSiteKey()),
      ownerAlerts: Boolean(process.env.ALERT_WEBHOOK_URL),
      photoStorage: process.env.CLOUDINARY_API_SECRET ? "cloudinary (signed)" : process.env.CLOUDINARY_UPLOAD_PRESET ? "cloudinary (unsigned - switch to signed keys)" : "local disk (dev only)",
    },
  });
}
