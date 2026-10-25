import { NextResponse } from "next/server";
import { z } from "zod";
import { staffFor } from "@/server/auth";
import { getMenuOverrides, setMenuOverrides, getCategories, getCustomDishes, setCustomDishes, getMenuVersion } from "@/server/config";
import { MENU } from "@/lib/data/menu";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { refreshMenuPages } from "@/server/menu-pages";

// Staff with Menu access: read the menu settings and switch dishes sold out / back on (built-in and added ones).
// Adding dishes, choices, categories, prices, names, photos etc. stays owner-only (Admin config).
export async function GET() {
  const u = await staffFor("menu");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [menuOverrides, categories, customDishes, menuVersion] = await Promise.all([getMenuOverrides(), getCategories(), getCustomDishes(), getMenuVersion()]);
  return NextResponse.json({ menuOverrides, categories, customDishes, menuVersion, canEdit: u.role === "admin" });
}

const patchSchema = z.object({ itemId: z.string().max(60), soldOut: z.boolean() });

export async function PATCH(req: Request) {
  const u = await staffFor("menu");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid dish." }, { status: 400 });
  const { itemId, soldOut } = parsed.data;
  const [ov, custom] = await Promise.all([getMenuOverrides(), getCustomDishes()]);
  if (MENU.some((m) => m.id === itemId)) {
    ov[itemId] = { ...(ov[itemId] ?? {}), soldOut };
    await setMenuOverrides(ov);
  } else {
    const dish = custom.find((d) => d.id === itemId);
    if (!dish) return NextResponse.json({ error: "Invalid dish." }, { status: 400 });
    dish.soldOut = soldOut;
    await setCustomDishes(custom);
  }
  await audit({ actor: actorOf(u), action: "menu.sold_out", entity: "menu", entityId: itemId, detail: { soldOut } });
  await refreshMenuPages(); // the menu pages show sold-out dishes
  return NextResponse.json({ menuOverrides: ov, customDishes: custom, menuVersion: await getMenuVersion() });
}
