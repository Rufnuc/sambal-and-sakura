import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyPassword, dummyVerify, createSession, publicUser, isStaffRole } from "@/server/auth";
import { loginSchema } from "@/server/validation";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { alertOwner } from "@/server/log";
import { reactivationDeadline } from "@/server/accounts";

const FAIL = "Incorrect email or password.";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: FAIL }, { status: 400 });
  const { email, password } = parsed.data;
  const ip = clientIp(req);

  // Brute force / credential stuffing: per network and per account. Also caps the CPU cost of
  // password hashing, so floods of logins can't slow the whole site down.
  const limited = await limitOr429([
    { name: "login-ip", id: ip, limit: 10, windowSec: 900 },
    { name: "login-email", id: email, limit: 8, windowSec: 3600 },
  ], "Too many sign-in attempts. Please wait 15 minutes and try again.");
  if (limited) {
    void audit({ action: "login.rate_limited", entity: "user", detail: { email }, ip });
    return limited;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same work and same answer whether or not the email exists.
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await dummyVerify(password), false);
  if (!user || !ok) {
    if (user && isStaffRole(user.role)) {
      await audit({ action: "login.failed", entity: "user", entityId: user.id, detail: { email }, ip });
      const recent = await prisma.auditLog.count({ where: { action: "login.failed", entityId: user.id, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
      if (recent >= 5) void alertOwner(`login-fail:${user.id}`, `${recent} failed sign-in attempts on the staff account ${email} in 10 minutes.`);
    }
    return NextResponse.json({ error: FAIL }, { status: 401 });
  }

  // Deactivated: correct password, but they must choose to reactivate (within 14 days).
  if (user.status === "deactivated") {
    const deadline = reactivationDeadline(user);
    if (deadline && deadline.getTime() > Date.now()) {
      return NextResponse.json({ error: "This account is deactivated.", deactivated: true, reactivateBy: deadline.toISOString() }, { status: 403 });
    }
    return NextResponse.json({ error: "This account has been closed." }, { status: 403 });
  }
  if (user.status !== "active") return NextResponse.json({ error: FAIL }, { status: 401 }); // closed accounts can't sign in

  await createSession(user);
  if (isStaffRole(user.role)) await audit({ actor: { id: user.id, email: user.email }, action: "login.success", entity: "user", entityId: user.id, ip });
  return NextResponse.json({ user: publicUser(user) });
}
