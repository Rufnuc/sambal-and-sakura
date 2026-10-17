import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { adminUser, verifyPassword, hashPassword } from "@/server/auth";
import { parsePermissions, GRANTABLE_SECTIONS } from "@/lib/admin/sections";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

const VALID_KEYS = new Set(GRANTABLE_SECTIONS.map((s) => s.key));

const patchSchema = z.object({
  role: z.enum(["staff", "admin"]).optional(),
  permissions: z.array(z.string().max(30)).max(20).optional(),
  confirmPassword: z.string().max(100).optional(), // the owner's own password: required to change roles or passwords, or grant sections
  newPassword: z.string().min(10).max(100).optional(), // owner resets a staff member's password
});

async function adminCount() {
  return prisma.user.count({ where: { role: "admin" } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await adminUser();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (target.role !== "staff" && target.role !== "admin")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const data: { role?: string; permissions?: string; passwordHash?: string } = {};
  // Giving MORE access (a role change, a new section) or resetting a password needs the owner's own password.
  // Taking access away doesn't, so it's quick to lock someone out.
  const current = new Set(parsePermissions(target.permissions));
  const grants = (parsed.data.permissions ?? []).some((p) => VALID_KEYS.has(p) && !current.has(p));
  const sensitive = (parsed.data.role && parsed.data.role !== target.role) || parsed.data.newPassword || grants;
  if (sensitive && (!parsed.data.confirmPassword || !(await verifyPassword(parsed.data.confirmPassword, me.passwordHash)))) {
    return NextResponse.json({ error: "Enter your own password to confirm this change.", needsPassword: true }, { status: 400 });
  }
  if (parsed.data.newPassword) data.passwordHash = await hashPassword(parsed.data.newPassword);
  if (parsed.data.role && parsed.data.role !== target.role) {
    if (target.role === "admin" && parsed.data.role !== "admin" && (await adminCount()) <= 1) {
      return NextResponse.json({ error: "There must always be at least one owner account." }, { status: 400 });
    }
    data.role = parsed.data.role;
  }
  if (parsed.data.permissions) data.permissions = JSON.stringify(parsed.data.permissions.filter((p) => VALID_KEYS.has(p)));
  if (data.role === "admin") data.permissions = "[]";

  const user = await prisma.user.update({
    where: { id }, data,
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  });
  // A role or password change takes effect immediately: their current sessions end.
  if (data.role || data.passwordHash) await prisma.session.deleteMany({ where: { userId: id } });
  await audit({ actor: actorOf(me), action: "staff.update", entity: "user", entityId: id, detail: { role: data.role, permissions: data.permissions, passwordReset: !!data.passwordHash } });
  return NextResponse.json({ user: { ...user, permissions: parsePermissions(user.permissions) } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await adminUser();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (id === me.id) return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || (target.role !== "staff" && target.role !== "admin")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (target.role === "admin" && (await adminCount()) <= 1) return NextResponse.json({ error: "There must always be at least one owner account." }, { status: 400 });
  await prisma.user.delete({ where: { id } }); // their sessions are deleted with them
  await audit({ actor: actorOf(me), action: "staff.delete", entity: "user", entityId: id, detail: { email: target.email, role: target.role } });
  return NextResponse.json({ ok: true });
}
