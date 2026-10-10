import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { adminUser, hashPassword } from "@/server/auth";
import { parsePermissions, GRANTABLE_SECTIONS } from "@/lib/admin/sections";
import { referralCode, withFreshIds } from "@/server/ids";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

const VALID_KEYS = new Set(GRANTABLE_SECTIONS.map((s) => s.key));

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).toLowerCase(),
  password: z.string().min(10).max(100),
  role: z.enum(["staff", "admin"]).default("staff"),
  permissions: z.array(z.string().max(30)).max(20).default([]),
});

export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const staff = await prisma.user.findMany({
    where: { role: { in: ["staff", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  });
  return NextResponse.json({ staff: staff.map((s) => ({ ...s, permissions: parsePermissions(s.permissions) })) });
}

export async function POST(req: Request) {
  const me = await adminUser();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the staff details (password at least 10 characters)." }, { status: 400 });

  const { name, email, password, role, permissions } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }
  const perms = role === "admin" ? [] : permissions.filter((p) => VALID_KEYS.has(p));
  const passwordHash = await hashPassword(password);
  const user = await withFreshIds(() => prisma.user.create({
    data: { name, email, passwordHash, phone: "", role, permissions: JSON.stringify(perms), referralCode: referralCode(name) },
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  }), ["referralCode"]);
  await audit({ actor: actorOf(me), action: "staff.create", entity: "user", entityId: user.id, detail: { email, role, permissions: perms } });
  return NextResponse.json({ user: { ...user, permissions: parsePermissions(user.permissions) } });
}
