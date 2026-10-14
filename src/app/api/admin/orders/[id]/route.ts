import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { orderStatusSchema } from "@/server/validation";
import { changeOrderStatus, OrderError } from "@/server/orders";
import { adminOrder, actorOf } from "@/server/admin-view";
import { clientIp } from "@/server/rate-limit";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await staffFor("orders");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = orderStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  try {
    const order = await changeOrderStatus(id, parsed.data.status, actorOf(u), { reason: parsed.data.reason, cancelKind: parsed.data.cancelKind, ip: clientIp(req) });
    return NextResponse.json({ order: order ? adminOrder(order) : null });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
