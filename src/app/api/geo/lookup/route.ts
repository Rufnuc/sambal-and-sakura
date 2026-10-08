import { NextResponse } from "next/server";

// Validate + geocode a UK postcode via postcodes.io (free, no key).
export async function GET(req: Request) {
  const pc = (new URL(req.url).searchParams.get("pc") ?? "").trim();
  if (!pc) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: false });
    const d = await r.json();
    const res = d.result;
    return NextResponse.json({
      ok: true,
      postcode: res.postcode,
      latitude: res.latitude,
      longitude: res.longitude,
      area: [res.admin_ward, res.admin_district].filter(Boolean).join(", "),
      district: res.admin_district,
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
