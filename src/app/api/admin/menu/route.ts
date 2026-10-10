import { NextResponse } from "next/server";
import { z } from "zod";
import { staffFor } from "@/server/auth";
import { getMenuOverrides, setMenuOverrides } from "@/server/config";
import { MENU } from "@/lib/data/menu";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Staff with Menu access: read the menu settings and switch dishes sold out / back on.
// Changing prices, names, photos etc. stays owner-only (Admin config).
export async function GET() {
  const u = await staffFor("menu");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ menuOverrides: await getMenuOverrides(), canEdit: u.role === "admin" });
}

const patchSchema = z.object({ itemId: z.string().max(60), soldOut: z.boolean() });

export async function PATCH(req: Request) {
  const u = await staffFor("menu");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !MENU.some((m) => m.id === parsed.data.itemId)) return NextResponse.json({ error: "Invalid dish." }, { status: 400 });
  const ov = await getMenuOverrides();
  ov[parsed.data.itemId] = { ...(ov[parsed.data.itemId] ?? {}), soldOut: parsed.data.soldOut };
  await setMenuOverrides(ov);
  await audit({ actor: actorOf(u), action: "menu.sold_out", entity: "menu", entityId: parsed.data.itemId, detail: { soldOut: parsed.data.soldOut } });
  return NextResponse.json({ menuOverrides: ov });
}
