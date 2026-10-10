import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { quoteSchema } from "@/server/validation";
import { buildQuote } from "@/server/orders";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { turnstileSiteKey } from "@/server/turnstile";

// The checkout shows exactly what the server will charge: prices, fees, discounts, free items,
// unavailable dishes and the times you can order for. Nothing is saved.
export async function POST(req: Request) {
  const limited = await limitOr429([{ name: "quote-ip", id: clientIp(req), limit: 120, windowSec: 600 }]);
  if (limited) return limited;
  const parsed = quoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid basket." }, { status: 400 });
  const user = await currentUser();
  const { quote } = await buildQuote(parsed.data, user);
  return NextResponse.json({ quote, turnstileSiteKey: user ? null : turnstileSiteKey() });
}
