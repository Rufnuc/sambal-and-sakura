import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUser, verifyPassword } from "@/server/auth";
import { zId } from "@/server/sanitize";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { deleteTestOrder, DeleteOrderError } from "@/server/order-delete";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";

// POST {ids, confirmPassword}: owner only. Removes test orders completely (see src/server/order-delete.ts).
// Several at once, so one password covers a clean-up. The password check shares the per-user limit
// of the other password checks (5 per 15 minutes).
const schema = z.object({ ids: z.array(zId(40)).min(1).max(100), confirmPassword: z.string().max(100) });

export async function POST(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "Only the owner can delete orders." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick the orders to delete (up to 100 at a time)." }, { status: 400 });
  const limited = await limitOr429([{ name: "pw-change", id: u.id, limit: 5, windowSec: 900 }]);
  if (limited) return limited;
  if (!(await verifyPassword(parsed.data.confirmPassword, u.passwordHash))) {
    await audit({ actor: actorOf(u), action: "order.delete_refused", entity: "order", detail: { reason: "wrong password", count: parsed.data.ids.length }, ip: clientIp(req) });
    return NextResponse.json({ error: "That's not your password.", needsPassword: true }, { status: 400 });
  }
  const deleted: string[] = [], refused: { id: string; error: string }[] = [];
  let referrerRewardKept = false;
  for (const id of [...new Set(parsed.data.ids)]) {
    try {
      const r = await deleteTestOrder(id);
      deleted.push(id);
      referrerRewardKept ||= r.referrerRewardKept;
      await audit({
        actor: actorOf(u), action: "order.deleted", entity: "order", entityId: id, ip: clientIp(req),
        detail: { total: r.order.total, fulfilment: r.order.fulfilment, status: r.order.status, placedAt: r.order.createdAt, pointsEntries: r.pointsEntries, vouchersReturned: r.vouchersReturned, referralReset: r.referralReset },
      });
    } catch (e) {
      if (e instanceof DeleteOrderError) refused.push({ id, error: e.message });
      else throw e;
    }
  }
  return NextResponse.json({ deleted, refused, referrerRewardKept });
}
