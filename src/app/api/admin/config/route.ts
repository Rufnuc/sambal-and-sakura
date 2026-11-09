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
  getDeliveryRules, setDeliveryRules,
  getCategories, setCategories,
  getCustomDishes, setCustomDishes, getMenuVersion,
  getOnlineDiscount, setOnlineDiscount, type OnlineDiscount,
  getLoyalty, setLoyalty, type LoyaltyConfig,
  type MenuOverrides, type ZoneConfig, type JobPosting, type DealOfDay, type ReferralConfig, type DeliveryRules,
} from "@/server/config";
import { TESTIMONIALS, type Offer, type WheelPrize } from "@/lib/data/site";
import { MENU, categoryLabel, type MenuCategoryCfg, type MenuItem } from "@/lib/data/menu";

const SAMPLE_REVIEW_TEXTS = new Set(TESTIMONIALS.map((t) => t.text.trim()));
import { getSiteContent, getSiteContentVersion, setSiteContent } from "@/server/site-content";
import {
  menuOverridesSchema, categoriesSchema, customDishesSchema, zonesSchema, offersSchema, wheelPrizesSchema, careersSchema, dealSchema, referralSchema, deliveryRulesSchema, onlineDiscountSchema, loyaltySchema, firstIssue,
} from "@/server/config-schema";
import { audit } from "@/server/audit";
import { refreshMenuPages } from "@/server/menu-pages";
import { actorOf } from "@/server/admin-view";
import { clientIp } from "@/server/rate-limit";
import { getPromotions, setPromotions, promotionsSchema, type PromotionsInput } from "@/server/promotions";

// Owner-only: prices, menu, offers, wheel, careers, zones and site content.
export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site, promotions, delivery, categories, customDishes, onlineDiscount, loyalty] = await Promise.all([
    getReferralConfig(), getZones(), getOffers(), getWheelPrizes(), getMenuOverrides(),
    getCareers(), getDeal(), getMaxMiles(), getSiteContent(), getPromotions(), getDeliveryRules(), getCategories(), getCustomDishes(), getOnlineDiscount(), getLoyalty(),
  ]);
  const [siteVersion, menuVersion] = await Promise.all([getSiteContentVersion(), getMenuVersion()]);
  return NextResponse.json({ referral, zones, offers, wheelPrizes, menuOverrides, careers, deal, maxMiles, site, siteVersion, promotions, delivery, categories, customDishes, menuVersion, onlineDiscount, loyalty });
}

type Block = { key: string; label: string; schema: z.ZodType; save: (v: never) => Promise<void> };
const MENU_BLOCKS = ["categories", "customDishes", "menuOverrides"];
const BLOCKS: Block[] = [
  { key: "referral", label: "Referral settings", schema: referralSchema, save: (v: ReferralConfig) => setReferralConfig(v) },
  { key: "zones", label: "Delivery zones", schema: zonesSchema, save: (v: ZoneConfig[]) => setZones(v) },
  { key: "delivery", label: "Delivery prices", schema: deliveryRulesSchema, save: (v: DeliveryRules) => setDeliveryRules(v) },
  { key: "offers", label: "Offers", schema: offersSchema, save: (v: Offer[]) => setOffers(v) },
  { key: "wheelPrizes", label: "Fortune Wheel prizes", schema: wheelPrizesSchema, save: (v: WheelPrize[]) => setWheelPrizes(v) },
  { key: "categories", label: "Menu categories", schema: categoriesSchema, save: (v: MenuCategoryCfg[]) => setCategories(v) },
  { key: "customDishes", label: "New dishes", schema: customDishesSchema, save: (v: MenuItem[]) => setCustomDishes(v) },
  { key: "menuOverrides", label: "Menu", schema: menuOverridesSchema, save: (v: MenuOverrides) => setMenuOverrides(v) },
  { key: "careers", label: "Careers", schema: careersSchema, save: (v: JobPosting[]) => setCareers(v) },
  { key: "deal", label: "Deal of the Day", schema: dealSchema, save: (v: DealOfDay) => setDeal(v) },
  { key: "loyalty", label: "Loyalty points", schema: loyaltySchema, save: (v: LoyaltyConfig) => setLoyalty(v) },
  { key: "onlineDiscount", label: "Online order discount", schema: onlineDiscountSchema, save: (v: OnlineDiscount | null) => setOnlineDiscount(v) },
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

  // Menu settings are saved whole, so a save made from an out-of-date screen would undo changes made since
  // (e.g. a dish staff just marked sold out). Like site content, it must say which version it started from.
  if (valid.some((v) => MENU_BLOCKS.includes(v.block.key)) && body.menuBaseVersion !== (await getMenuVersion())) {
    return NextResponse.json({ error: "The menu was changed somewhere else (for example a dish was marked sold out) since this page loaded. It has been reloaded: please make your change again.", conflict: true }, { status: 409 });
  }

  const menuProblem = await checkMenuLinks(valid);
  if (menuProblem) return NextResponse.json({ error: menuProblem }, { status: 400 });

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
  if (changed.length) {
    await audit({ actor: actorOf(u), action: "config.save", entity: "config", detail: { sections: changed }, ip: clientIp(req) });
    await refreshMenuPages(); // dishes, prices, categories, deal and site content all show on the menu pages
  }
  return GET();
}

/**
 * The menu pieces are saved separately, so check they still fit together after this save: every dish sits in
 * a category that exists, and offers / Deal of the Day only point at dishes that exist. Returns a sentence
 * the owner can act on, or null.
 */
async function checkMenuLinks(valid: { block: Block; value: unknown }[]): Promise<string | null> {
  const keys = ["categories", "customDishes", "menuOverrides", "offers", "deal", "wheelPrizes"];
  if (!valid.some((v) => keys.includes(v.block.key))) return null;
  const pick = <T,>(key: string, fallback: () => Promise<T>) => {
    const v = valid.find((x) => x.block.key === key);
    return v ? Promise.resolve(v.value as T) : fallback();
  };
  const [cats, custom, overrides, offers, deal, prizes] = await Promise.all([
    pick<MenuCategoryCfg[]>("categories", getCategories), pick<MenuItem[]>("customDishes", getCustomDishes),
    pick<MenuOverrides>("menuOverrides", getMenuOverrides), pick<Offer[]>("offers", getOffers), pick<DealOfDay>("deal", getDeal),
    pick<WheelPrize[]>("wheelPrizes", getWheelPrizes),
  ]);
  const catIds = new Set(cats.map((c) => c.id));
  for (const m of MENU) {
    const cat = overrides[m.id]?.category ?? m.category;
    if (!catIds.has(cat)) return `"${overrides[m.id]?.name ?? m.name}" is in the category "${categoryLabel(cats, cat)}", which would no longer exist. Move the dish to another category first, or hide the category instead of removing it.`;
  }
  for (const d of custom) {
    if (!catIds.has(d.category)) return `"${d.name}" is in the category "${categoryLabel(cats, d.category)}", which would no longer exist. Move the dish to another category first, or hide the category instead of removing it.`;
  }
  const dishIds = new Set([...MENU.map((m) => m.id), ...custom.map((d) => d.id)]);
  for (const o of offers) {
    if (o.freeItemId && !dishIds.has(o.freeItemId)) return `The offer "${o.title}" gives away a dish that has been deleted. Pick another free dish for it first.`;
  }
  if (deal.itemId && !dishIds.has(deal.itemId)) return "Deal of the Day points at a dish that has been deleted. Pick another dish for it first.";
  for (const p of prizes) {
    if (p.freeItemId && !dishIds.has(p.freeItemId)) return `The wheel prize "${p.label}" gives away a dish that has been deleted. Pick another free dish for it first.`;
  }
  return null;
}
