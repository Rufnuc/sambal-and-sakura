import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser, verifyPassword, hashPassword } from "@/server/auth";

const schema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || (user.role !== "staff" && user.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  return NextResponse.json({ ok: true });
}
