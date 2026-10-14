import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { hmacEquals } from "@/server/secrets";
import { log } from "@/server/log";

// Unsubscribe from promotional emails. Used by the button on /unsubscribe and by email apps'
// one-click "Unsubscribe" (RFC 8058: they POST here directly, with no cookies). The signed link
// means only the email's recipient can unsubscribe that account.
export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const userId = (sp.get("u") ?? "").slice(0, 40);
  const token = (sp.get("t") ?? "").slice(0, 100);
  if (!userId || !token || !hmacEquals("unsubscribe", userId, token)) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 });
  await prisma.user.updateMany({ where: { id: userId }, data: { marketingOptIn: false, marketingOptInAt: null } });
  log.info("unsubscribed", {});
  return NextResponse.json({ ok: true });
}
