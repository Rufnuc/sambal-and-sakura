import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser, verifyPassword, hashPassword, destroyOtherSessions, destroySession, isStaffRole } from "@/server/auth";
import { updateAccountSchema, changePasswordSchema } from "@/server/validation";
import { canonicalPhone } from "@/server/phone";
import { limitOr429 } from "@/server/rate-limit";
import { log } from "@/server/log";

// PATCH: update name/phone, or change password ({currentPassword, newPassword}).
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);

  if (body && typeof body === "object" && "newPassword" in body) {
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    const limited = await limitOr429([{ name: "pw-change", id: user.id, limit: 5, windowSec: 900 }]);
    if (limited) return limited;
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
    await destroyOtherSessions(user.id); // anyone else signed in with the old password is signed out
    return NextResponse.json({ ok: true });
  }

  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  const data = { ...parsed.data, ...(parsed.data.phone ? { phone: canonicalPhone(parsed.data.phone) } : {}) };
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ user: publicUser(updated) });
}

// GET ?export=1: download everything we hold about you (UK GDPR right of access / portability).
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("export") !== "1") return NextResponse.json({ user: publicUser(user) });
  const [orders, bookings, rewards, points] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id }, include: { lines: true }, orderBy: { createdAt: "desc" } }),
    prisma.booking.findMany({ where: { userId: user.id }, orderBy: { date: "desc" } }),
    prisma.reward.findMany({ where: { userId: user.id } }),
    prisma.pointsEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const strip = <T extends Record<string, unknown>>(o: T) => { const { payToken: _a, idempotencyKey: _b, flags: _c, printError: _d, ...r } = o; return r; };
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: publicUser(user), orders: orders.map(strip), bookings, rewards, points }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="sambal-sakura-my-data.json"` },
  });
}

// DELETE {password}: delete the account. Order records are kept for the restaurant's accounts,
// but with the personal details removed.
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isStaffRole(user.role)) return NextResponse.json({ error: "Staff accounts are removed by the owner in Admin → Staff." }, { status: 400 });
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const limited = await limitOr429([{ name: "account-delete", id: user.id, limit: 5, windowSec: 900 }]);
  if (limited) return limited;
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.order.updateMany({ where: { userId: user.id }, data: { userId: null, customerName: "Deleted customer", customerPhone: "", customerEmail: null, address: null, notes: null } }),
    prisma.booking.updateMany({ where: { userId: user.id }, data: { userId: null, name: "Deleted customer", phone: "", email: null, notes: null, dietary: null } }),
    prisma.user.delete({ where: { id: user.id } }), // sessions, rewards and points go with it
  ]);
  await destroySession();
  log.info("account_deleted", {});
  return NextResponse.json({ ok: true });
}
