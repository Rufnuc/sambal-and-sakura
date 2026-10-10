import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, verifyPassword, hashPassword, destroyOtherSessions, isStaffRole } from "@/server/auth";
import { changePasswordSchema } from "@/server/validation";
import { limitOr429 } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !isStaffRole(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.newPassword.length < 10) return NextResponse.json({ error: "New password must be at least 10 characters." }, { status: 400 });
  const limited = await limitOr429([{ name: "pw-change", id: user.id, limit: 5, windowSec: 900 }]);
  if (limited) return limited;

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  await destroyOtherSessions(user.id); // any other device signed in with the old password is signed out
  await audit({ actor: actorOf(user), action: "staff.password_change", entity: "user", entityId: user.id });
  return NextResponse.json({ ok: true });
}
