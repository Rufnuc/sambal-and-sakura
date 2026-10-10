import { NextResponse } from "next/server";
import { adminUser } from "@/server/auth";
import { getBlackouts, setBlackouts, getDisabledZones, setDisabledZones } from "@/server/settings";
import { settingsSchema } from "@/server/validation";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Owner-only: closed dates and paused delivery zones.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ blackouts: await getBlackouts(), disabledZones: await getDisabledZones() });
}

export async function PUT(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  if (parsed.data.blackouts) await setBlackouts(parsed.data.blackouts);
  if (parsed.data.disabledZones) await setDisabledZones(parsed.data.disabledZones);
  await audit({ actor: actorOf(u), action: "settings.save", entity: "settings", detail: parsed.data });
  return NextResponse.json({ blackouts: await getBlackouts(), disabledZones: await getDisabledZones() });
}
