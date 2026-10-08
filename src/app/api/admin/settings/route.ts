import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { getBlackouts, setBlackouts, getDisabledZones, setDisabledZones } from "@/server/settings";
import { settingsSchema } from "@/server/validation";

async function guard() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null; // settings are owner-only
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ blackouts: await getBlackouts(), disabledZones: await getDisabledZones() });
}

export async function PUT(req: Request) {
  if (!(await guard())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  if (parsed.data.blackouts) await setBlackouts(parsed.data.blackouts);
  if (parsed.data.disabledZones) await setDisabledZones(parsed.data.disabledZones);
  return NextResponse.json({ blackouts: await getBlackouts(), disabledZones: await getDisabledZones() });
}
