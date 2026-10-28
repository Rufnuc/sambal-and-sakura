import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { redeemLink } from "@/server/email-links";
import { clientIp, limitOr429 } from "@/server/rate-limit";

// POST {token}: the link from the sign-up email. Marks the email as confirmed (ordering never waited for it).
const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(req: Request) {
  const limited = await limitOr429([{ name: "verify-ip", id: clientIp(req), limit: 20, windowSec: 900 }]);
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link isn't complete. Please open it from the email again." }, { status: 400 });
  const userId = await redeemLink(parsed.data.token, "verify");
  if (!userId) return NextResponse.json({ error: "This link has expired or has already been used. If your email isn't confirmed yet, you can send a new link from your account page." }, { status: 410 });
  await prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
