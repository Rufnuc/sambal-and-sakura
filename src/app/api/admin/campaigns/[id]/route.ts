import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { adminUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Stop a promotion that hasn't finished sending (emails already sent can't be recalled).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const r = await prisma.campaign.updateMany({ where: { id, status: { in: ["queued", "sending"] } }, data: { status: "cancelled", finishedAt: new Date() } });
  if (r.count === 0) return NextResponse.json({ error: "That promotion has already finished." }, { status: 400 });
  await prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: "pending" }, data: { status: "skipped" } });
  await audit({ actor: actorOf(u), action: "campaign.cancel", entity: "campaign", entityId: id });
  return NextResponse.json({ ok: true });
}
