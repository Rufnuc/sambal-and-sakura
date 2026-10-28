import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { emailLink } from "@/server/email-links";
import { limitOr429 } from "@/server/rate-limit";

// POST: send the signed-in customer a new "confirm your email" link.
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, already: true });
  const limited = await limitOr429([{ name: "verify-resend", id: user.id, limit: 3, windowSec: 86400 }], "We've already sent a few links today. Please check your inbox and spam folder.");
  if (limited) return limited;
  await emailLink(user, "verify");
  return NextResponse.json({ ok: true });
}
