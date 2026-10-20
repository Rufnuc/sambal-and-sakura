import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { verifyPassword } from "@/server/auth";
import { limitOr429, clientIp } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { alertOwner } from "@/server/log";
import { prisma } from "@/server/db";

// "Enter your own password to confirm" for sensitive owner actions (adding staff, role/password changes,
// deleting orders). It shares the per-user limit of every other password check (5 per 15 minutes), so a
// borrowed or stolen signed-in session can't be used to guess the owner's password. Failures are audited,
// and the owner is alerted after 3 in 15 minutes.
const FAIL_ALERT_AT = 3;

/** null when the password is right; otherwise the response to send (400 needsPassword, or 429). */
export async function requireOwnPassword(me: User, password: string | undefined, req: Request, action: string, message: string): Promise<NextResponse | null> {
  const limited = await limitOr429([{ name: "pw-change", id: me.id, limit: 5, windowSec: 900 }]);
  if (limited) return limited;
  if (password && (await verifyPassword(password, me.passwordHash))) return null;
  await audit({ actor: actorOf(me), action: "stepup.failed", entity: "user", entityId: me.id, detail: { action }, ip: clientIp(req) });
  const recent = await prisma.auditLog.count({ where: { action: "stepup.failed", entityId: me.id, createdAt: { gte: new Date(Date.now() - 900_000) } } }).catch(() => 0);
  if (recent >= FAIL_ALERT_AT) void alertOwner(`stepup-failed:${me.id}`, `${recent} wrong password confirmations on ${me.email} in 15 minutes (${action}). If this wasn't you, sign out everywhere and change your password.`);
  return NextResponse.json({ error: message, needsPassword: true }, { status: 400 });
}
