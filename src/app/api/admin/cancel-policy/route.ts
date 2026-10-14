import { NextResponse } from "next/server";
import { adminUser } from "@/server/auth";
import { getCancelPolicy, setCancelPolicy, cancelPolicySchema } from "@/server/cancellations";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Owner-only: how long customers can cancel online, and limits for frequent cancellers.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ policy: await getCancelPolicy() });
}

export async function PUT(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = cancelPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the numbers (whole numbers, within the allowed ranges)." }, { status: 400 });
  if (parsed.data.restrictAt < parsed.data.flagAt) return NextResponse.json({ error: "The restrict level must be the same as or higher than the flag level." }, { status: 400 });
  await setCancelPolicy(parsed.data);
  await audit({ actor: actorOf(u), action: "settings.cancel_policy", entity: "settings", detail: parsed.data });
  return NextResponse.json({ policy: parsed.data });
}
