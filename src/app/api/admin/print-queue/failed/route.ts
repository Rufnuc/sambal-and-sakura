import { NextResponse } from "next/server";
import { z } from "zod";
import { staffFor } from "@/server/auth";
import { zText, zId } from "@/server/sanitize";
import { releaseTabletJob } from "@/server/print";

// The tablet couldn't print a ticket it took (printer unplugged, out of paper): give it back.
const schema = z.object({ orderId: zId(40), kind: z.enum(["order", "cancel"]), error: zText(200).optional() });

export async function POST(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid." }, { status: 400 });
  await releaseTabletJob(parsed.data.orderId, parsed.data.kind, parsed.data.error || "printer error");
  return NextResponse.json({ ok: true });
}
