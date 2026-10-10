import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { getOrdersPaused, setOrdersPaused } from "@/server/settings";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { alertOwner } from "@/server/log";

// Emergency switch any staff member with Orders access can flip (fake-order flood, kitchen problem...).
export async function POST(req: Request) {
  const u = await staffFor("orders");
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.paused !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await setOrdersPaused(body.paused);
  await audit({ actor: actorOf(u), action: body.paused ? "orders.pause" : "orders.resume", entity: "settings" });
  if (body.paused) void alertOwner("orders-paused", `Online orders were PAUSED by ${u.name}. Remember to turn them back on in Admin → Orders.`);
  return NextResponse.json({ paused: await getOrdersPaused() });
}
