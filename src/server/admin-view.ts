import type { Order, OrderLine } from "@prisma/client";

/** What the admin screens get for an order: everything staff need, never the payment token. */
export function adminOrder(o: Order & { lines: OrderLine[] }) {
  const { payToken: _p, idempotencyKey: _i, flags, ...rest } = o;
  let parsed: string[] = [];
  try { parsed = JSON.parse(flags); } catch { /* none */ }
  return { ...rest, flags: parsed };
}

export function actorOf(u: { id: string; email: string }) {
  return { id: u.id, email: u.email };
}
