import { NextResponse } from "next/server";
import { z } from "zod";
import { zText } from "@/server/sanitize";
import { prisma } from "@/server/db";
import { adminUser } from "@/server/auth";
import { createCampaign, marketableWhere } from "@/server/campaigns";
import { emailConfigured, marketingAllowanceToday, DAILY_LIMIT } from "@/server/email";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Owner-only promotional emails.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [campaigns, optedIn, allowance] = await Promise.all([
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, subject: true, audience: true, status: true, total: true, sent: true, failed: true, createdAt: true, finishedAt: true } }),
    prisma.user.count({ where: marketableWhere }),
    marketingAllowanceToday(),
  ]);
  return NextResponse.json({ campaigns, optedIn, allowanceToday: allowance, dailyLimit: DAILY_LIMIT, configured: emailConfigured() });
}

const version = z.object({ subject: zText(150), body: zText(5000, { multiline: true }) });
const schema = z.object({
  subject: zText(150, { min: 3 }),
  body: zText(5000, { min: 10, multiline: true }),
  translations: z.object({ zh: version.optional(), vi: version.optional(), ja: version.optional() }).optional(),
  audience: z.enum(["all", "selected"]),
  userIds: z.array(z.string().max(40)).max(5000).optional(),
});

export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up yet (add the Brevo key in the server settings)." }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a subject (3+ characters) and a message (10+ characters)." }, { status: 400 });
  if (parsed.data.audience === "selected" && !parsed.data.userIds?.length) return NextResponse.json({ error: "Pick at least one customer." }, { status: 400 });
  // Keep only language versions that have both a subject and a message.
  const translations = Object.fromEntries(Object.entries(parsed.data.translations ?? {}).filter(([, v]) => v && v.subject.length >= 3 && v.body.length >= 10));
  const campaign = await createCampaign({ ...parsed.data, translations, createdBy: u.email });
  await audit({ actor: actorOf(u), action: "campaign.create", entity: "campaign", entityId: campaign.id, detail: { subject: campaign.subject, audience: campaign.audience, recipients: campaign.total } });
  return NextResponse.json({ campaign });
}
