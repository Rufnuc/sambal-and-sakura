import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser, publicUser } from "@/server/auth";
import { updateAccountSchema } from "@/server/validation";

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });

  const updated = await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  return NextResponse.json({ user: publicUser(updated) });
}
