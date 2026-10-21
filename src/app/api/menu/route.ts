import { NextResponse } from "next/server";
import { getPublicMenu, getCategories } from "@/server/config";

// The menu customers can order from right now (hidden dishes and hidden categories left out), for the
// basket's suggestions and the admin pickers. Same data the public menu page shows.
export const dynamic = "force-dynamic";

export async function GET() {
  const [menu, cats] = await Promise.all([getPublicMenu(), getCategories()]);
  const categories = cats.filter((c) => !c.hidden).map(({ id, label }) => ({ id, label }));
  return NextResponse.json({ menu, categories }, { headers: { "Cache-Control": "no-store" } });
}
