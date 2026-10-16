import { prisma } from "@/server/db";
import { OFFERS, WHEEL_PRIZES, ORDERING, type Offer, type WheelPrize } from "@/lib/data/site";
import { MENU, type MenuItem, type MenuCategory } from "@/lib/data/menu";
import { TABLES, type Table } from "@/lib/data/tables";
import { getPromotions } from "@/server/promotions";
import { LEGACY_CODE_VALUES } from "@/server/pricing";

// Operator-editable config, stored as JSON Setting rows with static defaults.
// Customer pages + server pricing read the EFFECTIVE values from here.

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}
async function setJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}

/* ---- Referral ---- */
// enabled: read from the owner's Campaigns switch (server/promotions.ts). give: friend's £ off their first order (needs minSpend of food);
// get: referrer's £ off, issued after the friend's first completed order of at least minSpend;
// maxPerUser: most rewarded/pending referrals one customer can have (0 = no limit).
export interface ReferralConfig { enabled: boolean; give: number; get: number; minSpend: number; maxPerUser: number }
export const DEFAULT_REFERRAL: ReferralConfig = { enabled: true, give: 5, get: 5, minSpend: 20, maxPerUser: 10 };
// Merged with the defaults: settings saved before the on/off switch existed have no `enabled`.
export const getReferralConfig = async (): Promise<ReferralConfig> => {
  const [saved, promos] = await Promise.all([getJson<Partial<ReferralConfig>>("referral", {}), getPromotions()]);
  return { ...DEFAULT_REFERRAL, ...saved, enabled: promos.referral.enabled };
};
export const setReferralConfig = ({ enabled: _ignored, ...v }: ReferralConfig) => setJson("referral", v); // on/off lives in Campaigns

/* ---- Delivery zones ---- */
export interface ZoneConfig { id: string; label: string; postcodes: string[]; fee: number; etaMins: number }
export const getZones = () => getJson<ZoneConfig[]>("zones", ORDERING.deliveryZones as ZoneConfig[]);
export const setZones = (v: ZoneConfig[]) => setJson("zones", v);

/* ---- Delivery money rules ---- */
// minOrder: least food (before discounts) for a delivery order. freeDeliveryOver: food total from which
// delivery is free; null = delivery is never free. Edited in Admin -> Settings -> Delivery.
export interface DeliveryRules { minOrder: number; freeDeliveryOver: number | null }
export const DEFAULT_DELIVERY_RULES: DeliveryRules = { minOrder: ORDERING.minOrder, freeDeliveryOver: ORDERING.freeDeliveryThreshold };
export const getDeliveryRules = async (): Promise<DeliveryRules> => ({ ...DEFAULT_DELIVERY_RULES, ...(await getJson<Partial<DeliveryRules>>("deliveryRules", {})) });
export const setDeliveryRules = (v: DeliveryRules) => setJson("deliveryRules", v);

/* ---- Floor plan tables ---- */
// Edited in Admin -> Floor plan; the booking engine and the live plan use this list.
export const getFloorTables = () => getJson<Table[]>("floorTables", TABLES);
/** Save, tidying "joins with" so it's always two-way (if A joins B, B joins A) and uses the exact names. */
export async function setFloorTables(v: Table[]) {
  const byKey = new Map(v.map((t) => [t.id.toLowerCase(), t.id]));
  const joins = new Map<string, Set<string>>(v.map((t) => [t.id, new Set<string>()]));
  for (const t of v) for (const o of t.combinesWith ?? []) {
    const other = byKey.get(o.toLowerCase());
    if (other && other !== t.id) { joins.get(t.id)!.add(other); joins.get(other)!.add(t.id); }
  }
  const tidy = v.map((t) => ({ ...t, x: Math.round((t.x ?? 50) * 10) / 10, y: Math.round((t.y ?? 50) * 10) / 10, combinesWith: [...joins.get(t.id)!].sort() }));
  await setJson("floorTables", tidy);
  return tidy;
}

/* ---- Offers ---- */
// Offers saved before codes had their own settings get the original values for SAKURA10 / FAMILY52 / FREEGYOZA,
// and lists saved before WELCOME10 became an offer get it added (hidden). Once the owner saves the offers
// again ("offersV2"), the list is exactly what they saved, so removing WELCOME10 then sticks.
const WELCOME10 = OFFERS.find((o) => o.code === "WELCOME10")!;
export const getOffers = async (): Promise<Offer[]> => {
  const [saved, v2] = await Promise.all([getJson<Offer[] | null>("offers", null), getJson<boolean>("offersV2", false)]);
  if (!saved) return OFFERS;
  const list = saved.map((o) => {
    const legacy = o.code ? LEGACY_CODE_VALUES[o.code.toUpperCase()] : undefined;
    return legacy && !(o.pctOff || o.amountOff || o.freeItemId) ? { ...o, ...legacy } : o;
  });
  return !v2 && !list.some((o) => o.code?.toUpperCase() === "WELCOME10") ? [...list, WELCOME10] : list;
};
export const setOffers = async (v: Offer[]) => { await setJson("offers", v); await setJson("offersV2", true); };

/* ---- Wheel prizes ---- */
export const getWheelPrizes = () => getJson<WheelPrize[]>("wheelPrizes", WHEEL_PRIZES);
export const setWheelPrizes = (v: WheelPrize[]) => setJson("wheelPrizes", v);

/* ---- Menu overrides (name / price / soldOut / image / category / lead-time per item) ---- */
export type MenuOverride = {
  name?: string; price?: number; soldOut?: boolean;
  image?: string; images?: string[]; category?: MenuCategory; leadTimeHours?: number; description?: string; aiNotes?: string;
};
export const MAX_DISH_PHOTOS = 6;
export type MenuOverrides = Record<string, MenuOverride>;
export const getMenuOverrides = () => getJson<MenuOverrides>("menuOverrides", {});
export const setMenuOverrides = (v: MenuOverrides) => setJson("menuOverrides", v);

/* ---- Careers ---- */
export interface JobPosting {
  id: string; title: string; type: string; location: string;
  summary: string; description: string; active: boolean;
}
export const DEFAULT_CAREERS: JobPosting[] = [
  { id: "sushi-chef", title: "Sushi Chef", type: "Full-time", location: "Middlesbrough, TS1", summary: "Craft authentic sushi and Japanese dishes alongside our Japan-trained head chef.", description: "We're looking for a skilled sushi chef to join our kitchen. Experience with nigiri, maki and Japanese technique preferred. Competitive pay, meals on shift, and a supportive team.", active: true },
  { id: "kitchen-assistant", title: "Kitchen Assistant", type: "Part-time", location: "Middlesbrough, TS1", summary: "Support our chefs with prep and service in a busy, friendly kitchen.", description: "Help with food prep, plating and keeping the kitchen running smoothly. No experience needed - full training given. Flexible evenings and weekends.", active: true },
  { id: "delivery-driver", title: "Delivery Driver", type: "Part-time", location: "Middlesbrough", summary: "Deliver fresh orders across Middlesbrough. Own vehicle preferred.", description: "Reliable drivers wanted for evening delivery shifts. Cash handling, friendly service and good local knowledge. Fuel contribution and tips.", active: true },
];
export const getCareers = () => getJson<JobPosting[]>("careers", DEFAULT_CAREERS);
export const setCareers = (v: JobPosting[]) => setJson("careers", v);

/* ---- Deal of the day ---- */
export interface DealOfDay { active: boolean; title: string; description: string; itemId?: string; price?: number; badge: string }
export const DEFAULT_DEAL: DealOfDay = { active: false, title: "", description: "", badge: "Deal of the Day" };
export const getDeal = () => getJson<DealOfDay>("dealOfDay", DEFAULT_DEAL);
export const setDeal = (v: DealOfDay) => setJson("dealOfDay", v);

/* ---- Max delivery mileage ---- */
export const getMaxMiles = () => getJson<number>("maxDeliveryMiles", 6);
export const setMaxMiles = (v: number) => setJson("maxDeliveryMiles", v);

export async function getEffectiveMenu(): Promise<MenuItem[]> {
  const ov = await getMenuOverrides();
  return MENU.map((m) => {
    const o = ov[m.id];
    if (!o) return m;
    return {
      ...m,
      name: o.name ?? m.name,
      description: o.description ?? m.description,
      price: typeof o.price === "number" ? o.price : m.price,
      soldOut: typeof o.soldOut === "boolean" ? o.soldOut : m.soldOut,
      // Photos: `images` (main first) when the owner has saved a set; older saves only have `image`.
      ...(o.images
        ? { image: o.images[0] ?? "", images: o.images }
        : { image: o.image ?? m.image, images: o.image ? [o.image] : undefined }),
      category: o.category ?? m.category,
      leadTimeHours: typeof o.leadTimeHours === "number" ? o.leadTimeHours : m.leadTimeHours,
      aiNotes: o.aiNotes ?? m.aiNotes,
    };
  });
}
