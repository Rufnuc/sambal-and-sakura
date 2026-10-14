import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { hashPassword, createSession, publicUser } from "@/server/auth";
import { registerSchema } from "@/server/validation";
import { referralCode, rewardCode, withFreshIds } from "@/server/ids";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { verifyHuman } from "@/server/turnstile";
import { canonicalPhone, phoneKey } from "@/server/phone";
import { WELCOME_POINTS } from "@/server/points";
import { log } from "@/server/log";
import { isEmailBlocked } from "@/server/accounts";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  const { name, email, phone, password, marketingOptIn, locale, turnstileToken } = parsed.data;
  const ip = clientIp(req);

  // Duplicate-account farming: limit per network (trusted IP, see rate-limit.ts) and per phone.
  const limited = await limitOr429([
    { name: "register-ip", id: ip, limit: 3, windowSec: 86400 },
    { name: "register-phone", id: phoneKey(phone), limit: 2, windowSec: 30 * 86400 },
  ], "Too many accounts created recently. Please contact us if you need help.");
  if (limited) return limited;
  if (!(await verifyHuman(turnstileToken, ip))) {
    return NextResponse.json({ error: "Please complete the security check and try again." }, { status: 400 });
  }

  // Closed accounts' emails can't be reused (stops re-creating accounts to collect rewards again).
  if (await isEmailBlocked(email)) {
    return NextResponse.json({ error: "This email can't be used for a new account. Please contact the restaurant if you think this is a mistake." }, { status: 409 });
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "An account with that email already exists - sign in instead." }, { status: 409 });
  }

  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const passwordHash = await hashPassword(password);
  const user = await withFreshIds(() => prisma.user.create({
    data: {
      name, email, phone: canonicalPhone(phone),
      passwordHash,
      marketingOptIn, marketingOptInAt: marketingOptIn ? new Date() : null, locale,
      referralCode: referralCode(name),
      points: 0,
      // The sign-up bonus is pending: it becomes spendable when the first order is completed,
      // so creating accounts on its own earns nothing.
      pointsEntries: { create: { delta: WELCOME_POINTS, reason: "welcome", status: "pending" } },
      // The welcome reward is a first-order offer: one per phone number (enforced at checkout).
      rewards: { create: { label: "10% off your first order", code: rewardCode("WELC"), kind: "percent", amount: 10, source: "welcome", expiresAt } },
    },
  }), ["referralCode", "code"]);
  log.info("account_created", { userId: user.id });
  await createSession(user);
  return NextResponse.json({ user: publicUser(user) });
}
