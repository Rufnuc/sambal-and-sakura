import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyPassword, dummyVerify, createSession, publicUser } from "@/server/auth";
import { loginSchema } from "@/server/validation";
import { reactivateAccount, reactivationDeadline } from "@/server/accounts";
import { clientIp, limitOr429 } from "@/server/rate-limit";

// Reactivate a deactivated account within 14 days (email + password, like signing in).
export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Incorrect email or password." }, { status: 400 });
  const { email, password } = parsed.data;
  const limited = await limitOr429([
    { name: "login-ip", id: clientIp(req), limit: 10, windowSec: 900 },
    { name: "login-email", id: email, limit: 8, windowSec: 3600 },
  ], "Too many attempts. Please wait 15 minutes and try again.");
  if (limited) return limited;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await dummyVerify(password), false);
  if (!user || !ok) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  const deadline = reactivationDeadline(user);
  if (user.status !== "deactivated" || !deadline || deadline.getTime() <= Date.now()) {
    return NextResponse.json({ error: user.status === "active" ? "This account is already active - just sign in." : "This account has been closed and can't be reactivated." }, { status: 400 });
  }
  await reactivateAccount(user);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  await createSession(fresh);
  return NextResponse.json({ user: publicUser(fresh) });
}
