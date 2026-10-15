import { NextResponse } from "next/server";
import type { z } from "zod";
import { adminUser } from "@/server/auth";
import {
  getReferralConfig, setReferralConfig,
  getZones, setZones,
  getOffers, setOffers,
  getWheelPrizes, setWheelPrizes,
  getMenuOverrides, setMenuOverrides,
  getCareers, setCareers,
  getDeal, setDeal,
  getMaxMiles, setMaxMiles,
  type MenuOverrides, type ZoneConfig, type JobPosting, type DealOfDay, type ReferralConfig,
} from "@/server/config";
import { TESTIMONIALS, type Offer, type WheelPrize } from "@/lib/data/site";

const SAMPLE_REVIEW_TEXTS = new Set(TESTIMONIALS.map((t) => t.text.trim()));
import { getSiteContent, getSiteContentVersion, setSiteContent } from "@/server/site-content";
import {
  menuOverridesSchema, zonesSchema, offersSchema, wheelPrizesSchema, careersSchema, dealSchema, referralSchema, firstIssue,
} from "@/server/config-schema";
import { audit } from "@/server/audit";
import { actorOf } from "@/server/admin-view";
import { clientIp } from "@/server/rate-limit";
import { getPromotions, setPromotions, promotionsSchema, type PromotionsInput } from "@/server/promotions";

// Owner-only: prices, menu, offers, wheel, careers, zones and site content.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site, promotions] = await Promise.all([
    getReferralConfig(), getZones(), getOffers(), getWheelPrizes(), getMenuOverrides(),
    getCareers(), getDeal(), getMaxMiles(), getSiteContent(), getPromotions(),
  ]);
  const siteVersion = await getSiteContentVersion();
  return NextResponse.json({ referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site, siteVersion, promotions });
}

type Block = { key: string; label: string; schema: z.ZodType; save: (v: never) => Promise<void> };
const BLOCKS: Block[] = [
  { key: "referral", label: "Referral settings", schema: referralSchema, save: (v: ReferralConfig) => setReferralConfig(v) },
  { key: "zones", label: "Delivery zones", schema: zonesSchema, save: (v: ZoneConfig[]) => setZones(v) },
  { key: "offers", label: "Offers", schema: offersSchema, save: (v: Offer[]) => setOffers(v) },
  { key: "wheelPrizes", label: "Fortune Wheel prizes", schema: wheelPrizesSchema, save: (v: WheelPrize[]) => setWheelPrizes(v) },
  { key: "menuOverrides", label: "Menu", schema: menuOverridesSchema, save: (v: MenuOverrides) => setMenuOverrides(v) },
  { key: "careers", label: "Careers", schema: careersSchema, save: (v: JobPosting[]) => setCareers(v) },
  { key: "deal", label: "Deal of the Day", schema: dealSchema, save: (v: DealOfDay) => setDeal(v) },
  { key: "promotions", label: "Campaigns", schema: promotionsSchema, save: async (v: PromotionsInput) => { await setPromotions(v); } },
] as Block[];

export async function PUT(req: Request) {
  const u = await adminUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  // Validate everything first, so a bad field never leaves a half-saved config.
  const valid: { block: Block; value: unknown }[] = [];
  for (const block of BLOCKS) {
    if (body[block.key] === undefined) continue;
    const r = block.schema.safeParse(body[block.key]);
    if (!r.success) return NextResponse.json({ error: firstIssue(r.error, block.label) }, { status: 400 });
    valid.push({ block, value: r.data });
  }
  if (body.maxMiles !== undefined && (typeof body.maxMiles !== "number" || !Number.isFinite(body.maxMiles) || body.maxMiles < 0 || body.maxMiles > 50)) {
    return NextResponse.json({ error: "Delivery distance must be between 0 and 50 miles." }, { status: 400 });
  }

  // Never publish the demo (fictional) testimonials as if they were real reviews.
  const items: { text?: string }[] = body.site?.reviews?.items ?? [];
  if (body.site?.reviews?.show && items.some((it) => SAMPLE_REVIEW_TEXTS.has(String(it?.text ?? "").trim()))) {
    return NextResponse.json({ error: "Reviews: replace the sample reviews with genuine ones (or switch reviews off) before showing them." }, { status: 400 });
  }

  // Site content is validated strictly too, with optimistic concurrency (409 if someone else saved first).
  if (body.site !== undefined) {
    const base = typeof body.siteBaseVersion === "string" ? body.siteBaseVersion : undefined;
    const r = await setSiteContent(body.site, base);
    if (!r.ok) return NextResponse.json({ error: r.error, conflict: !!r.conflict }, { status: r.conflict ? 409 : 400 });
  }
  for (const { block, value } of valid) await block.save(value as never);
  if (typeof body.maxMiles === "number") await setMaxMiles(body.maxMiles);

  const changed = [...valid.map((v) => v.block.key), ...(body.site !== undefined ? ["site"] : []), ...(typeof body.maxMiles === "number" ? ["maxMiles"] : [])];
  if (changed.length) await audit({ actor: actorOf(u), action: "config.save", entity: "config", detail: { sections: changed }, ip: clientIp(req) });
  return GET();
}
