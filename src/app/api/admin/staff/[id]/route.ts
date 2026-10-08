import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { parsePermissions, GRANTABLE_SECTIONS } from "@/lib/admin/sections";

const VALID_KEYS = new Set(GRANTABLE_SECTIONS.map((s) => s.key));

async function requireAdmin() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}

const patchSchema = z.object({
  role: z.enum(["staff", "admin"]).optional(),
  permissions: z.array(z.string().max(30)).max(20).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const data: { role?: string; permissions?: string } = {};
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.permissions) data.permissions = JSON.stringify(parsed.data.permissions.filter((p) => VALID_KEYS.has(p)));
  if (data.role === "admin") data.permissions = "[]";

  const user = await prisma.user.update({
    where: { id }, data,
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ user: { ...user, permissions: parsePermissions(user.permissions) } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (id === me.id) return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  await prisma.user.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
