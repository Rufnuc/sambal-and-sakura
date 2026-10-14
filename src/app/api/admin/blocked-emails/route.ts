import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUser } from "@/server/auth";
import { unblockEmail } from "@/server/accounts";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Owner-only: let an email from a closed account sign up again (genuine mistakes only).
export async function DELETE(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = z.object({ email: z.string().trim().email().max(120) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const removed = await unblockEmail(parsed.data.email);
  await audit({ actor: actorOf(u), action: "email.unblock", entity: "blocked-email", detail: { removed } });
  return NextResponse.json({ ok: true, removed });
}
