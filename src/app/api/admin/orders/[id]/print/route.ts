import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { reprintOrder } from "@/server/print";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// Staff: send an order's ticket to the kitchen printer again (paper jam, missed ticket...).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await staffFor("orders");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await reprintOrder(id);
  await audit({ actor: actorOf(u), action: "order.reprint", entity: "order", entityId: id, detail: { ok: result.ok } });
  return NextResponse.json(result);
}
