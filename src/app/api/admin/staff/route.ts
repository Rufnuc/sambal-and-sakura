import { NextResponse } from "next/server";
import { z } from "zod";
import { zText, zEmail } from "@/server/sanitize";
import { prisma } from "@/server/db";
import { adminUser, hashPassword, verifyPassword } from "@/server/auth";
import { parsePermissions, GRANTABLE_SECTIONS } from "@/lib/admin/sections";
import { referralCode, withFreshIds } from "@/server/ids";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

const VALID_KEYS = new Set(GRANTABLE_SECTIONS.map((s) => s.key));

const createSchema = z.object({
  name: zText(80, { min: 2 }),
  email: zEmail,
  password: z.string().min(10).max(100),
  role: z.enum(["staff", "admin"]).default("staff"),
  permissions: z.array(z.string().max(30)).max(20).default([]),
  confirmPassword: z.string().max(100).optional(), // the owner's own password (required)
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

  // Step-up: a new staff or owner account is lasting access, so (like role changes) it needs the
  // current owner's own password - a borrowed or stolen signed-in session alone isn't enough.
  if (!parsed.data.confirmPassword || !(await verifyPassword(parsed.data.confirmPassword, me.passwordHash))) {
    return NextResponse.json({ error: "Enter your own password to add a staff member.", needsPassword: true }, { status: 400 });
  }
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
