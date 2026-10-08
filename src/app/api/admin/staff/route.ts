import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser, hashPassword, referralCode } from "@/server/auth";
import { parsePermissions, GRANTABLE_SECTIONS } from "@/lib/admin/sections";

const VALID_KEYS = new Set(GRANTABLE_SECTIONS.map((s) => s.key));

async function requireAdmin() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).toLowerCase(),
  password: z.string().min(8).max(100),
  role: z.enum(["staff", "admin"]).default("staff"),
  permissions: z.array(z.string().max(30)).max(20).default([]),
});

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const staff = await prisma.user.findMany({
    where: { role: { in: ["staff", "admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  });
  return NextResponse.json({ staff: staff.map((s) => ({ ...s, permissions: parsePermissions(s.permissions) })) });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the staff details (password min 8 chars)." }, { status: 400 });

  const { name, email, password, role, permissions } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }
  const perms = role === "admin" ? [] : permissions.filter((p) => VALID_KEYS.has(p));
  const user = await prisma.user.create({
    data: {
      name, email, passwordHash: await hashPassword(password), phone: "",
      role, permissions: JSON.stringify(perms), referralCode: referralCode(name),
    },
    select: { id: true, name: true, email: true, role: true, permissions: true, createdAt: true },
  });
  return NextResponse.json({ user: { ...user, permissions: parsePermissions(user.permissions) } });
}
