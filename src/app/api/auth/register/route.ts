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
import { getReferralConfig } from "@/server/config";
import { checkReferralCode, referralSignupData, ReferralError } from "@/server/referrals";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  const { name, email, phone, password, marketingOptIn, locale, turnstileToken, referralCode: refCode } = parsed.data;
  const ip = clientIp(req);

  // Duplicate-account farming: limit per network (trusted IP, see rate-limit.ts) first...
  const LIMIT_MSG = "Too many accounts created recently. Please contact us if you need help.";
  const limited = await limitOr429([{ name: "register-ip", id: ip, limit: 3, windowSec: 86400 }], LIMIT_MSG);
  if (limited) return limited;
  if (!(await verifyHuman(turnstileToken, ip))) {
    return NextResponse.json({ error: "Please complete the security check and try again." }, { status: 400 });
  }

  // A friend's referral code: checked before the account exists, so a bad code can be fixed or removed.
  const refCfg = await getReferralConfig();
  let referral: ReturnType<typeof referralSignupData> | null = null;
  if (refCode) {
    try {
      const referrer = await checkReferralCode(refCode, refCfg);
      if (referrer) referral = referralSignupData(referrer, refCode, phone, refCfg);
    } catch (e) {
      if (e instanceof ReferralError) return NextResponse.json({ error: e.message, field: "referralCode" }, { status: 400 });
      throw e;
    }
  }

  // Closed accounts' emails can't be reused (stops re-creating accounts to collect rewards again).
  // One answer for "already registered" and "closed", and only AFTER every check that doesn't depend
  // on the email, so a made-up request (e.g. with a bad referral code) can't reveal whether an email
  // has an account here.
  if ((await isEmailBlocked(email)) || (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
    return NextResponse.json({ error: "We couldn't create an account with that email. If you've ordered with us before, sign in instead, or contact the restaurant." }, { status: 409 });
  }

  // ...and per phone, counted only for a request that is about to create an account, so sign-ups that are
  // refused (bad referral code, failed bot check, email already registered) can't use up someone else's
  // phone allowance and block them from signing up.
  const phoneLimited = await limitOr429([{ name: "register-phone", id: phoneKey(phone), limit: 2, windowSec: 30 * 86400 }], LIMIT_MSG);
  if (phoneLimited) return phoneLimited;

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
      rewards: { create: [
        { label: "10% off your first order", code: rewardCode("WELC"), kind: "percent", amount: 10, source: "welcome", expiresAt },
        ...(referral ? [{ ...referral.reward, code: rewardCode("REF") }] : []), // fresh code on each retry
      ] },
      ...(referral ? { referredBy: referral.referredBy } : {}),
    },
  }), ["referralCode", "code"]);
  log.info("account_created", { userId: user.id, referred: !!referral });
  await createSession(user);
  return NextResponse.json({ user: publicUser(user) });
}
