import { NextResponse } from "next/server";
import { z } from "zod";
import { zText } from "@/server/sanitize";
import { getSiteContent } from "@/server/site-content";
import { validTrackToken } from "@/server/cancellations";
import { customerCancelOrder, OrderError } from "@/server/orders";
import { clientIp, limitOr429 } from "@/server/rate-limit";

const REASONS = ["Changed my mind", "Ordered by mistake", "Taking too long", "Other"] as const;
const schema = z.object({ reason: z.enum(REASONS), note: zText(200).optional() });

// The customer cancels from their tracking page: only with the signed link and inside the allowed window.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ip = clientIp(req);
  const limited = await limitOr429([{ name: "track-cancel-ip", id: ip, limit: 10, windowSec: 3600 }]);
  if (limited) return limited;
  const { id } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!validTrackToken(id, t)) return NextResponse.json({ error: "This tracking link isn't valid." }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please choose a reason." }, { status: 400 });
  const { business } = await getSiteContent();
  try {
    const reason = parsed.data.note ? `${parsed.data.reason} - ${parsed.data.note}` : parsed.data.reason;
    await customerCancelOrder(id, reason, business.phone, ip);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
