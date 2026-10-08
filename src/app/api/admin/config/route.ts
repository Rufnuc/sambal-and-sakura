import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import {
  getReferralConfig, setReferralConfig,
  getZones, setZones,
  getOffers, setOffers,
  getWheelPrizes, setWheelPrizes,
  getMenuOverrides, setMenuOverrides,
  getCareers, setCareers,
  getDeal, setDeal,
  getMaxMiles, setMaxMiles,
  type ReferralConfig, type ZoneConfig, type MenuOverrides, type JobPosting, type DealOfDay,
} from "@/server/config";
import type { Offer, WheelPrize } from "@/lib/data/site";
import { getSiteContent, getSiteContentVersion, setSiteContent } from "@/server/site-content";

async function guard() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null; // config editing is owner-only
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site] = await Promise.all([
    getReferralConfig(), getZones(), getOffers(), getWheelPrizes(), getMenuOverrides(),
    getCareers(), getDeal(), getMaxMiles(), getSiteContent(),
  ]);
  const siteVersion = await getSiteContentVersion();
  return NextResponse.json({ referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site, siteVersion });
}

export async function PUT(req: Request) {
  const u = await guard();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  // Site content is validated strictly; reject the whole request with a readable reason if invalid.
  if (body.site !== undefined) {
    const base = typeof body.siteBaseVersion === "string" ? body.siteBaseVersion : undefined;
    const r = await setSiteContent(body.site, base);
    if (!r.ok) return NextResponse.json({ error: r.error, conflict: !!r.conflict }, { status: r.conflict ? 409 : 400 });
  }

  try {
    if (body.referral) {
      const r = body.referral as ReferralConfig;
      await setReferralConfig({
        give: clampNum(r.give, 0, 100), get: clampNum(r.get, 0, 100),
        minSpend: clampNum(r.minSpend, 0, 500), maxPerUser: clampNum(r.maxPerUser, 0, 1000),
      });
    }
    if (Array.isArray(body.zones)) {
      await setZones((body.zones as ZoneConfig[]).slice(0, 50).map((z) => ({
        id: String(z.id).slice(0, 20), label: String(z.label).slice(0, 80),
        postcodes: (z.postcodes ?? []).map((p) => String(p).toUpperCase().slice(0, 6)).slice(0, 60),
        fee: clampNum(z.fee, 0, 50), etaMins: clampNum(z.etaMins, 0, 180),
      })));
    }
    if (Array.isArray(body.offers)) await setOffers((body.offers as Offer[]).slice(0, 30));
    if (Array.isArray(body.wheelPrizes)) {
      const wp = (body.wheelPrizes as WheelPrize[]).slice(0, 12).map((p) => ({ ...p, weight: clampNum(p.weight, 0, 1000) }));
      if (wp.some((p) => p.weight > 0)) await setWheelPrizes(wp);
    }
    if (body.menuOverrides && typeof body.menuOverrides === "object") {
      await setMenuOverrides(body.menuOverrides as MenuOverrides);
    }
    if (Array.isArray(body.careers)) await setCareers((body.careers as JobPosting[]).slice(0, 30));
    if (body.deal && typeof body.deal === "object") await setDeal(body.deal as DealOfDay);
    if (typeof body.maxMiles === "number") await setMaxMiles(clampNum(body.maxMiles, 0, 50));
  } catch {
    return NextResponse.json({ error: "Could not save." }, { status: 400 });
  }

  return GET();
}

function clampNum(n: unknown, min: number, max: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
