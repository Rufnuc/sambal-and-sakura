import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUser } from "@/server/auth";
import { requireOwnPassword } from "@/server/step-up";
import { zId } from "@/server/sanitize";
import { clientIp } from "@/server/rate-limit";
import { deleteTestOrder, DeleteOrderError } from "@/server/order-delete";
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
  const denied = await requireOwnPassword(u, parsed.data.confirmPassword, req, "order.delete", "That's not your password.");
  if (denied) return denied;
  const deleted: string[] = [], refused: { id: string; error: string }[] = [];
  let referrerRewardKept = false;
  for (const id of [...new Set(parsed.data.ids)]) {
    try {
      const r = await deleteTestOrder(id, { actor: actorOf(u), ip: clientIp(req) }); // audit entry written in the same transaction
      deleted.push(id);
      referrerRewardKept ||= r.referrerRewardKept;
    } catch (e) {
      if (e instanceof DeleteOrderError) refused.push({ id, error: e.message });
      else throw e;
    }
  }
  return NextResponse.json({ deleted, refused, referrerRewardKept });
}
