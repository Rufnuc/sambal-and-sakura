import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUser } from "@/server/auth";
import { getSiteContent } from "@/server/site-content";
import { sendTransactional, emailConfigured } from "@/server/email";
import { campaignEmail } from "@/server/email-templates";
import { unsubscribeUrl } from "@/server/campaigns";

// Send the draft promotion to the owner's own email to check how it looks.
const schema = z.object({ subject: z.string().trim().min(3).max(150), body: z.string().trim().min(10).max(5000), locale: z.enum(["en", "zh", "vi", "ja"]).default("en") });

export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up yet (add the Brevo key in the server settings)." }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a subject and a message first." }, { status: 400 });
  const { business } = await getSiteContent();
  const m = campaignEmail(`[TEST] ${parsed.data.subject}`, parsed.data.body, u.name, parsed.data.locale, unsubscribeUrl(u.id), business);
  const ok = await sendTransactional("campaign-test", `campaign-test:${u.id}:${Date.now()}`, { to: { email: u.email, name: u.name }, ...m });
  return ok ? NextResponse.json({ ok: true, to: u.email }) : NextResponse.json({ error: "The test email couldn't be sent. Check the Brevo settings." }, { status: 502 });
}
