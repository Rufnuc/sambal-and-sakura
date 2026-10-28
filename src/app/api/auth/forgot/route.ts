import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { zEmail } from "@/server/sanitize";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { emailLink } from "@/server/email-links";
import { log } from "@/server/log";

// POST {email}: email a password-reset link. Customers only: staff and admin passwords are reset by the
// owner in Admin -> Staff, so getting into a staff member's inbox isn't enough to take over the admin.
// The answer (and the time it takes) is the same whether or not the email has an account.
const schema = z.object({ email: zEmail });
const SAME_ANSWER = { ok: true, message: "If there's an account with that email, we've sent a link to reset your password. It works for 30 minutes." };

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email you signed up with." }, { status: 400 });
  const email = parsed.data.email;
  const limited = await limitOr429([
    { name: "forgot-ip", id: clientIp(req), limit: 5, windowSec: 3600 },
    { name: "forgot-email", id: email, limit: 3, windowSec: 3600 }, // can't be used to flood someone's inbox
  ], "Too many reset requests. Please wait a while and try again.");
  if (limited) return limited;

  // Not awaited, so a reply for a real account takes no longer than one for a made-up email.
  void (async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "customer" || user.status === "closed") return;
    await emailLink(user, "reset");
    log.info("password_reset_requested", { userId: user.id });
  })().catch((e) => log.error("password_reset_email_failed", { error: (e as Error).message }));

  return NextResponse.json(SAME_ANSWER);
}
