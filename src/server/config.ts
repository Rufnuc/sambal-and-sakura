import { createHash } from "node:crypto";
import { cache } from "react";
import { prisma } from "@/server/db";
import { OFFERS, WHEEL_PRIZES, ORDERING, type Offer, type WheelPrize } from "@/lib/data/site";
import { MENU, DEFAULT_CATEGORIES, RETIRED_CATEGORIES, CUSTOM_DISH_ID, type Allergen, type DietTag, type MenuItem, type MenuCategory, type MenuCategoryCfg, type ModifierGroup } from "@/lib/data/menu";
import { TABLES, type Table } from "@/lib/data/tables";
import { getPromotions } from "@/server/promotions";
import { LEGACY_CODE_VALUES } from "@/server/pricing";

// Operator-editable config, stored as JSON Setting rows with static defaults.
// Customer pages + server pricing read the EFFECTIVE values from here.

// One database read per setting per request. Pages read the same settings many times (the menu alone
// needs dish settings, added dishes and categories, and a page's title and body each load it). Saving a
// setting forgets its cached value, so a save followed by a read in the same request sees the new value.
// Outside a request (scripts, jobs) `cache` doesn't memoise and every read goes to the database.
const requestSettings = cache(() => new Map<string, Promise<string | null>>());
function readSetting(key: string): Promise<string | null> {
  const store = requestSettings();
  let value = store.get(key);
  if (!value) {
    value = prisma.setting.findUnique({ where: { key } }).then((row) => row?.value ?? null);
    store.set(key, value);
  }
  return value;
}

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const value = await readSetting(key);
  if (value === null) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
async function setJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
  requestSettings().delete(key);
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
  const [saved, v2, v3] = await Promise.all([getJson<Offer[] | null>("offers", null), getJson<boolean>("offersV2", false), getJson<boolean>("offersV3", false)]);
  if (!saved) return OFFERS;
  let list = saved.map((o) => {
    const legacy = o.code ? LEGACY_CODE_VALUES[o.code.toUpperCase()] : undefined;
    return legacy && !(o.pctOff || o.amountOff || o.freeItemId) ? { ...o, ...legacy } : o;
  });
  if (!v2 && !list.some((o) => o.code?.toUpperCase() === "WELCOME10")) list = [...list, WELCOME10];
  return v3 ? list : upgradeOffersForNewMenu(list);
};
export const setOffers = async (v: Offer[]) => { await setJson("offers", v); await setJson("offersV2", true); await setJson("offersV3", true); };

// Offers saved for the previous menu ("offersV3" not set yet) move to the new menu's offers once:
// the old-menu ones go (Family Feast, Express Lunch, free gyoza), an untouched SAKURA10 moves to a
// £15 minimum, and FEAST5 / SWEET35 are added after the first-order offer. The owner's own offers stay.
const OLD_MENU_OFFERS = new Set(["family", "lunch", "freegyoza"]);
const OLD_FIRST10_TERMS = "Min spend £12. One use per customer. Website orders only.";
function upgradeOffersForNewMenu(list: Offer[]): Offer[] {
  const first10 = OFFERS.find((o) => o.id === "first10")!;
  const kept = list
    .filter((o) => !OLD_MENU_OFFERS.has(o.id))
    .map((o) => (o.id === "first10" && o.minSpend === 12 && o.terms === OLD_FIRST10_TERMS ? { ...o, minSpend: first10.minSpend, terms: first10.terms } : o));
  const added = OFFERS.filter((o) => (o.id === "feast5" || o.id === "sweet35") && !kept.some((k) => k.id === o.id || k.code?.toUpperCase() === o.code));
  const at = kept.findIndex((o) => o.id === "first10") + 1;
  return [...kept.slice(0, at), ...added, ...kept.slice(at)];
}

/* ---- Wheel prizes ---- */
// Prizes saved before free prizes named a dish ("wheelPrizesV2" not set) get the new menu's dishes once:
// free drink = soft drink, free dessert = Bubur Cha Cha, and "Free side" (no sides on the new menu)
// becomes free prawn crackers. Once the owner saves the prizes, they are exactly what was saved.
export const getWheelPrizes = async (): Promise<WheelPrize[]> => {
  const [saved, v2] = await Promise.all([getJson<WheelPrize[] | null>("wheelPrizes", null), getJson<boolean>("wheelPrizesV2", false)]);
  if (!saved) return WHEEL_PRIZES;
  if (v2) return saved;
  return saved.map((p) => {
    const d = WHEEL_PRIZES.find((x) => x.id === p.id);
    if (p.kind !== "freebie" || p.freeItemId || !d?.freeItemId) return p;
    return { ...p, freeItemId: d.freeItemId, ...(p.id === "freeside" && p.label === "Free side" ? { label: d.label } : {}) };
  });
};
export const setWheelPrizes = async (v: WheelPrize[]) => { await setJson("wheelPrizes", v); await setJson("wheelPrizesV2", true); };

/* ---- Menu overrides (name / price / soldOut / image / category / lead-time per item) ---- */
export type MenuOverride = {
  name?: string; price?: number; soldOut?: boolean;
  image?: string; images?: string[]; category?: MenuCategory; leadTimeHours?: number; description?: string; aiNotes?: string;
  hidden?: boolean;               // owner hid this built-in dish from the menu (can be shown again)
  modifiers?: ModifierGroup[];    // owner replaced the dish's choices (sizes, proteins, extras)
  // Entered by the kitchen for the printed menu's dishes (the menu data leaves them empty).
  allergens?: Allergen[]; allergensChecked?: boolean; tags?: DietTag[]; spiceLevel?: 0 | 1 | 2 | 3;
  phoneOrder?: boolean;           // on the menu, but ordered by phone only
};
export const MAX_DISH_PHOTOS = 6;
export type MenuOverrides = Record<string, MenuOverride>;
// Settings saved for dishes that are no longer on the menu (e.g. the previous menu's dishes) are left
// out, so they can't block the next admin save ("Menu: Invalid key in record") and are dropped when it
// writes the list back.
const MENU_IDS = new Set(MENU.map((m) => m.id));
export const getMenuOverrides = async (): Promise<MenuOverrides> =>
  Object.fromEntries(Object.entries(await getJson<MenuOverrides>("menuOverrides", {})).filter(([id]) => MENU_IDS.has(id)));
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
// A deal saved for a dish that is no longer on the menu (e.g. the previous menu) is switched off rather
// than pointing at nothing (and blocking every menu save); the owner sets up a new one in Promotions.
export const getDeal = async (): Promise<DealOfDay> => {
  const deal = await getJson<DealOfDay>("dealOfDay", DEFAULT_DEAL);
  return deal.itemId && !MENU.some((m) => m.id === deal.itemId) && !CUSTOM_DISH_ID.test(deal.itemId) ? { ...deal, itemId: undefined, active: false } : deal;
};
export const setDeal = (v: DealOfDay) => setJson("dealOfDay", v);

/* ---- Max delivery mileage ---- */
export const getMaxMiles = () => getJson<number>("maxDeliveryMiles", 6);
export const setMaxMiles = (v: number) => setJson("maxDeliveryMiles", v);

/* ---- Menu: categories and the owner's own dishes ---- */
// Categories (order, names, hidden) and dishes the owner added are data, edited in Admin -> Menu.
export const getCategories = async () => {
  const [saved, custom] = await Promise.all([getJson<MenuCategoryCfg[]>("menuCategories", DEFAULT_CATEGORIES), getCustomDishes()]);
  return upgradeCategories(saved, new Set(custom.map((d) => d.category)));
};

/**
 * A saved category list always shows every built-in category (otherwise its dishes would silently
 * vanish: only listed categories are shown). A list saved for the previous menu (it still has the
 * retired categories) is rebuilt: the owner's own categories that came first stay first (e.g. Appetiser),
 * then the new menu in its printed order, then the owner's other categories. A retired category that
 * still holds dishes the owner added is kept, so those dishes don't disappear.
 */
function upgradeCategories(saved: MenuCategoryCfg[], usedByCustom: Set<string>): MenuCategoryCfg[] {
  const builtIn = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const retired = new Set(RETIRED_CATEGORIES.filter((id) => !usedByCustom.has(id)));
  if (saved.some((c) => retired.has(c.id))) {
    const own = saved.filter((c) => !builtIn.has(c.id) && !retired.has(c.id));
    const firstBuiltIn = saved.findIndex((c) => builtIn.has(c.id) || retired.has(c.id));
    const leading = own.filter((c) => saved.indexOf(c) < firstBuiltIn);
    const hidden = new Set(saved.filter((c) => c.hidden).map((c) => c.id));
    const menu = DEFAULT_CATEGORIES.map((c) => (hidden.has(c.id) ? { ...c, hidden: true } : c));
    return [...leading, ...menu, ...own.filter((c) => !leading.includes(c))];
  }
  const missing = DEFAULT_CATEGORIES.filter((c) => !saved.some((s) => s.id === c.id));
  return missing.length ? [...saved, ...missing] : saved;
}
export const setCategories = (v: MenuCategoryCfg[]) => setJson("menuCategories", v);
export const getCustomDishes = () => getJson<MenuItem[]>("customDishes", []);
export const setCustomDishes = (v: MenuItem[]) => setJson("customDishes", v.map((d) => ({ ...d, custom: true })));

/**
 * Fingerprint of the saved menu settings (dish changes, added dishes, categories). The admin Menu screen
 * sends back the version it loaded; a save from a stale screen is refused, so it can't silently undo a
 * change made elsewhere in the meantime (e.g. staff marking a dish sold out).
 */
export async function getMenuVersion(): Promise<string> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["menuOverrides", "customDishes", "menuCategories"] } }, orderBy: { key: "asc" } });
  return createHash("sha1").update(rows.map((r) => `${r.key}=${r.value}`).join("\n")).digest("hex").slice(0, 16);
}

/** Every dish, including hidden ones and those in hidden categories (for the admin). */
export async function getAdminMenu(): Promise<MenuItem[]> {
  const [ov, custom] = await Promise.all([getMenuOverrides(), getCustomDishes()]);
  return [...MENU.map((m) => applyOverride(m, ov[m.id])), ...custom.map((d) => ({ ...d, custom: true }))];
}

/** What customers see, and the only dishes that can be priced and ordered. */
export async function getEffectiveMenu(): Promise<MenuItem[]> {
  const [all, cats] = await Promise.all([getAdminMenu(), getCategories()]);
  const shown = new Set(cats.filter((c) => !c.hidden).map((c) => c.id));
  return all.filter((m) => !m.hidden && shown.has(m.category)).map(({ hidden: _h, ...m }) => m);
}

/**
 * The menu as it may be sent to a browser: the effective menu without owner-only fields. aiNotes are
 * only for the dish assistant (server side). allergensChecked stays: an empty, confirmed allergen list
 * means "none of the 14", an unconfirmed one means "ask us".
 * Use this for every page and API that hands menu items to the client.
 */
export async function getPublicMenu(): Promise<MenuItem[]> {
  return (await getEffectiveMenu()).map(({ aiNotes: _n, ...m }) => m);
}

function applyOverride(m: MenuItem, o: MenuOverride | undefined): MenuItem {
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
      modifiers: o.modifiers ?? m.modifiers,
      allergens: o.allergens ?? m.allergens,
      allergensChecked: o.allergens ? o.allergensChecked : m.allergensChecked,
      tags: o.tags ?? m.tags,
      spiceLevel: o.spiceLevel ?? m.spiceLevel,
      phoneOrder: typeof o.phoneOrder === "boolean" ? o.phoneOrder : m.phoneOrder,
      ...(o.hidden ? { hidden: true } : {}),
    };
}
