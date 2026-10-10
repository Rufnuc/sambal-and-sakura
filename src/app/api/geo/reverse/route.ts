import { NextResponse } from "next/server";
import { clientIp, limitOr429 } from "@/server/rate-limit";

// Nearest UK postcode for a lat/lon (for "use my location"). postcodes.io, free.
export async function GET(req: Request) {
  const limited = await limitOr429([{ name: "geo-ip", id: clientIp(req), limit: 40, windowSec: 600 }]);
  if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes?lon=${lon}&lat=${lat}`, { cache: "no-store" });
    const d = await r.json();
    const res = d.result?.[0];
    if (!res) return NextResponse.json({ ok: false });
    return NextResponse.json({
      ok: true, postcode: res.postcode, latitude: res.latitude, longitude: res.longitude,
      area: [res.admin_ward, res.admin_district].filter(Boolean).join(", "),
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
