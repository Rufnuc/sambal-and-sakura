import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { ANALYTICS_EVENTS } from "@/lib/data/site";
import { clientIp, hit } from "@/server/rate-limit";

const ALLOWED = new Set<string>(ANALYTICS_EVENTS);

// First-party analytics. The browser only sends events after the visitor accepts analytics cookies.
// Stored without IP addresses or personal data; kept 90 days (see the nightly clean-up job).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!ALLOWED.has(name)) return new NextResponse(null, { status: 204 });
  const rl = await hit("events-ip", clientIp(req), 300, 3600);
  if (!rl.ok) return new NextResponse(null, { status: 204 }); // silently drop floods

  // Keep only small, non-personal props (ids, counts, flags).
  const props: Record<string, string | number | boolean> = {};
  if (body.props && typeof body.props === "object") {
    for (const [k, v] of Object.entries(body.props as Record<string, unknown>).slice(0, 8)) {
      if (!/^[a-z_]{1,20}$/i.test(k) || ["name", "phone", "email", "address", "notes"].includes(k)) continue;
      if (typeof v === "number" || typeof v === "boolean") props[k] = v;
      else if (typeof v === "string") props[k] = v.slice(0, 40);
    }
  }
  await prisma.event.create({ data: { name, props: JSON.stringify(props) } });
  return new NextResponse(null, { status: 204 });
}
