import { NextResponse } from "next/server";
import { ORDERING } from "@/lib/data/site";
import { clientIp, limitOr429 } from "@/server/rate-limit";

// Restaurant coordinates (236-238 Linthorpe Rd, Middlesbrough).
const REST_LAT = 54.5705;
const REST_LON = -1.2355;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Driving distance + time from the restaurant to a point (OSRM public demo, free, no key).
export async function GET(req: Request) {
  const limited = await limitOr429([{ name: "geo-ip", id: clientIp(req), limit: 40, windowSec: 600 }]);
  if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return NextResponse.json({ ok: false }, { status: 400 });

  const straightMiles = Math.round(haversineMiles(REST_LAT, REST_LON, lat, lon) * 10) / 10;
  let driveMins: number | null = null;
  let driveMiles: number | null = null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${REST_LON},${REST_LAT};${lon},${lat}?overview=false`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      const route = d.routes?.[0];
      if (route) {
        driveMins = Math.round(route.duration / 60);
        driveMiles = Math.round((route.distance / 1609.34) * 10) / 10;
      }
    }
  } catch {
    /* OSRM unavailable - fall back to straight-line estimate */
  }

  const prep = ORDERING.prepTimeMins;
  // Best time to leave so food is ready on arrival (collection).
  const leaveInMins = driveMins !== null ? Math.max(0, prep - driveMins) : null;

  return NextResponse.json({
    ok: true,
    straightMiles,
    driveMiles: driveMiles ?? straightMiles,
    driveMins,
    prepMins: prep,
    leaveInMins,
  });
}
