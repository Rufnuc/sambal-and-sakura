import { z } from "zod";
import { MENU, ALLERGENS, DIET_TAGS, CUSTOM_DISH_ID, type Allergen, type DietTag } from "@/lib/data/menu";
import { zText, zCode } from "@/server/sanitize";

// Strict shapes for everything the owner can save in Admin → config. Anything else is rejected
// with a readable message instead of being stored as-is.

// Owner-typed text, sanitised (control/invisible characters and HTML tags removed). Line breaks kept.
const text = (max: number, min = 0) => zText(max, { min, multiline: true });
const money = z.number().finite().min(0).max(1000);
const pence = (n: number) => Math.round(n * 100) === n * 100;
// Photos: our own /uploads or /menu paths, or https (e.g. Cloudinary). Never javascript:, data: etc.
const imageUrl = z.string().trim().max(500).refine((s) => s === "" || s.startsWith("/") && !s.startsWith("//") || /^https:\/\//i.test(s), "Images must be an https link or an uploaded photo.");

const MENU_IDS = new Set(MENU.map((m) => m.id));
/** A built-in dish, or one the owner added (the config route checks added ones still exist). */
const anyDishId = z.string().max(60).refine((id) => MENU_IDS.has(id) || CUSTOM_DISH_ID.test(id), "Pick a dish from the menu.");
// A dish photo: uploaded here (/uploads/...) or an https link. Never javascript:, data:, or path tricks.
const dishPhoto = z.string().trim().max(500).refine((s) => (s.startsWith("/uploads/") && !s.includes("..")) || /^https:\/\/[^\s"'<>]+$/i.test(s), "Photos must be uploaded here or be an https link.");
const dishPhotos = z.array(dishPhoto).max(6, "Up to 6 photos per dish.").refine((a) => new Set(a).size === a.length, "That photo is already added.");
const slugId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Ids are lower-case letters, numbers and dashes.");

// A dish's choices (size, protein, extras). Prices only go up: an option can add to the price, never take
// it below the dish price. Option ids must be unique across the dish, since an order names options by id.
export const modifierGroupsSchema = z.array(z.object({
  id: slugId,
  label: text(60, 1),
  type: z.enum(["single", "multi"]),
  required: z.boolean().optional(),
  options: z.array(z.object({
    id: slugId,
    label: text(60, 1),
    priceDelta: z.number().finite().min(0, "Choices can add to the price, not reduce it.").max(100).refine(pence, "Use pounds and pence, e.g. 1 or 1.50."),
  }).strict()).min(1, "Each choice group needs at least one option.").max(30),
}).strict()).max(8, "Up to 8 choice groups per dish.").superRefine((groups, ctx) => {
  const g = new Set<string>(), o = new Set<string>();
  for (const grp of groups) {
    if (g.has(grp.id)) ctx.addIssue({ code: "custom", message: `Two choice groups are both called "${grp.label}".` });
    g.add(grp.id);
    for (const opt of grp.options) {
      if (o.has(opt.id)) ctx.addIssue({ code: "custom", message: `The option "${opt.label}" appears twice in this dish.` });
      o.add(opt.id);
    }
  }
});

export const menuOverridesSchema = z.record(
  z.string().refine((id) => MENU_IDS.has(id), "Unknown dish"),
  z.object({
    name: text(80, 1).optional(),
    price: money.optional(),
    soldOut: z.boolean().optional(),
    image: imageUrl.optional(),
    images: dishPhotos.optional(),
    category: slugId.optional(), // must be one of the saved categories (checked in the config route)
    leadTimeHours: z.number().int().min(0).max(168).optional(),
    description: text(600).optional(),
    aiNotes: text(1500).optional(),
    hidden: z.boolean().optional(),
    modifiers: modifierGroupsSchema.optional(),
  }).strict(),
);

// Menu categories, in menu order. Removing one that still has dishes is refused in the config route.
export const categoriesSchema = z.array(z.object({
  id: slugId,
  label: text(40, 1),
  hidden: z.boolean().optional(),
}).strict()).min(1, "Keep at least one category.").max(40).superRefine((cats, ctx) => {
  const ids = new Set<string>(), labels = new Set<string>();
  for (const c of cats) {
    if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `Two categories share the id "${c.id}".` });
    if (labels.has(c.label.toLowerCase())) ctx.addIssue({ code: "custom", message: `There are two categories called "${c.label}".` });
    ids.add(c.id); labels.add(c.label.toLowerCase());
  }
});

// Dishes the owner added. Allergens are a legal requirement on food sold online, so a dish can only be saved
// once the owner has ticked its allergens (or confirmed it has none of the 14).
export const customDishesSchema = z.array(z.object({
  id: z.string().regex(CUSTOM_DISH_ID, "Unknown dish id."),
  name: text(80, 1),
  category: slugId,
  price: money.refine(pence, "Use pounds and pence, e.g. 8 or 8.50."),
  description: text(600),
  allergens: z.array(z.enum(ALLERGENS as [Allergen, ...Allergen[]])).max(ALLERGENS.length).refine((a) => new Set(a).size === a.length, "An allergen is listed twice."),
  allergensChecked: z.literal(true, { message: "Tick the allergens in each new dish (or confirm it contains none) before saving." }),
  tags: z.array(z.enum(DIET_TAGS.map((t) => t.id) as [DietTag, ...DietTag[]])).max(DIET_TAGS.length).default([]),
  spiceLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  image: z.string().optional(), // ignored: set from `images`
  images: dishPhotos.optional(),
  soldOut: z.boolean().optional(),
  hidden: z.boolean().optional(),
  custom: z.boolean().optional(),
  leadTimeHours: z.number().int().min(0).max(168).optional(),
  aiNotes: text(1500).optional(),
  modifiers: modifierGroupsSchema.optional(),
}).strict().transform((d) => ({ ...d, image: d.images?.[0] ?? "", images: d.images?.length ? d.images : undefined, custom: true as const })))
  .max(200, "Up to 200 added dishes.")
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const d of list) {
      if (seen.has(d.id)) ctx.addIssue({ code: "custom", message: `"${d.name}" is listed twice.` });
      seen.add(d.id);
    }
  });

export const zonesSchema = z.array(z.object({
  id: text(20, 1), label: text(80, 1),
  postcodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}\d[A-Z\d]?$/, "Use outward codes like TS1")).max(60),
  fee: z.number().finite().min(0).max(50), etaMins: z.number().int().min(0).max(180),
})).max(50);

export const deliveryRulesSchema = z.object({
  minOrder: z.number().finite().min(0).max(200),
  freeDeliveryOver: z.number().finite().min(0).max(500).nullable(), // null = no free delivery
}).strict();


// An offer's code works at checkout exactly as set here, so it's checked strictly: a code must say what it
// gives (one of % off, £ off or a free dish), amounts must make sense, and no two offers may share a code.
export const offersSchema = z.array(z.object({
  id: text(40, 1), title: text(120, 1), description: text(400),
  code: zCode(20).optional(),
  badge: text(40).optional(), terms: text(400), kind: z.enum(["percent", "freebie", "bundle", "first-order"]),
  pctOff: z.number().int("Use a whole number for % off.").min(1).max(50).optional(),
  amountOff: z.number().min(0.5).max(100).refine(pence, "Use pounds and pence, e.g. 5 or 2.50.").optional(),
  freeItemId: anyDishId.optional(),
  minSpend: z.number().min(0).max(500).refine(pence, "Use pounds and pence, e.g. 20 or 12.50.").optional(),
  firstOrderOnly: z.boolean().optional(),
  oncePerCustomer: z.boolean().optional(),
  hidden: z.boolean().optional(),
}).strict()
  .transform((o) => {
    const code = o.code || undefined;
    // No code: nothing to redeem, so drop any code settings.
    if (!code) return { ...o, code, pctOff: undefined, amountOff: undefined, freeItemId: undefined, minSpend: undefined, firstOrderOnly: undefined, oncePerCustomer: undefined, hidden: undefined };
    return { ...o, code };
  })
  .superRefine((o, ctx) => {
    if (!o.code) return;
    const gives = [o.pctOff, o.amountOff, o.freeItemId].filter((v) => v !== undefined).length;
    if (gives !== 1) ctx.addIssue({ code: "custom", message: `"${o.title}": choose what the code ${o.code} gives - % off, £ off or a free dish (just one).` });
    if (o.code.length < 3) ctx.addIssue({ code: "custom", message: `"${o.title}": codes need at least 3 letters or numbers.` });
    if (o.amountOff !== undefined && (o.minSpend ?? 0) < o.amountOff) ctx.addIssue({ code: "custom", message: `"${o.title}": the minimum spend must be at least the £ off (otherwise food could be free).` });
  }))
  .max(30)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const o of list) {
      if (!o.code) continue;
      if (seen.has(o.code)) ctx.addIssue({ code: "custom", message: `Two offers use the code ${o.code} - each code can only be used once.` });
      seen.add(o.code);
    }
  });

// The reward value is taken from the label ("15% off" → 15, "£5 next order" → 5) unless given,
// so what the customer is shown is exactly what they get.
export const wheelPrizesSchema = z.array(z.object({
  id: text(40, 1), label: text(40, 1),
  kind: z.enum(["percent", "freebie", "voucher", "none"]),
  weight: z.number().finite().min(0).max(1000),
  color: z.enum(["gold", "red", "pink", "charcoal"]),
  amount: z.number().finite().min(0).max(50).optional(),
}).strict()
  .transform((p) => {
    if (p.kind !== "percent" && p.kind !== "voucher") return { ...p, amount: undefined };
    const fromLabel = Number(/(\d+(?:\.\d+)?)/.exec(p.label)?.[1]);
    return { ...p, amount: Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : p.amount };
  })
  .refine((p) => p.kind === "freebie" || p.kind === "none" || (typeof p.amount === "number" && p.amount > 0 && p.amount <= 50), "Put the amount in the label of % and £ prizes, e.g. \"15% off\" or \"£5 off\" (max 50)."))
  .max(12)
  .refine((ps) => ps.some((p) => p.weight > 0), "At least one prize needs a chance above zero.");

export const careersSchema = z.array(z.object({
  id: text(60, 1), title: text(120, 1), type: text(40), location: text(80),
  summary: text(300), description: text(3000), active: z.boolean(),
}).strict()).max(30);

export const dealSchema = z.object({
  active: z.boolean(), title: text(120), description: text(400),
  itemId: anyDishId.optional(),
  price: money.optional(), badge: text(40),
}).strict();

export const referralSchema = z.object({
  enabled: z.boolean().default(true), // ignored on save: the Campaigns switch decides
  give: z.number().min(0).max(100), get: z.number().min(0).max(100),
  minSpend: z.number().min(0).max(500), maxPerUser: z.number().int().min(0).max(1000),
}).strict()
  // Amounts in pounds and pence only, and the friend's reward can't be more than the food they must buy.
  .refine((r) => [r.give, r.get, r.minSpend].every((n) => Math.round(n * 100) === n * 100), "Use pounds and pence, e.g. 5 or 2.50.")
  .refine((r) => r.give > 0 && r.get > 0, "Both rewards need to be more than £0 (to stop referrals, switch them off under Campaigns).")
  .refine((r) => r.minSpend >= r.give, "The minimum spend must be at least the friend's reward (otherwise they could get food free).");

/** First validation problem as a sentence the owner can act on. */
// Floor plan tables (Admin -> Floor plan). Names unique; "joins with" only names other tables in the list.
export const floorTablesSchema = z.array(z.object({
  id: zText(16, { min: 1 }),
  seats: z.number().int().min(1).max(30),
  zone: zText(30, { min: 1 }),
  combinesWith: z.array(zText(16, { min: 1 })).max(6).optional(),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
  shape: z.enum(["round", "square", "long"]),
})).min(1, "Keep at least one table.").max(80).superRefine((tables, ctx) => {
  const ids = tables.map((t) => t.id.toLowerCase());
  ids.forEach((id, i) => { if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", message: `Two tables are called "${tables[i].id}" - give each table its own name.`, path: [i, "id"] }); });
  tables.forEach((t, i) => (t.combinesWith ?? []).forEach((o) => {
    if (o.toLowerCase() === t.id.toLowerCase() || !ids.includes(o.toLowerCase())) ctx.addIssue({ code: "custom", message: `${t.id} joins with "${o}", which isn't another table.`, path: [i, "combinesWith"] });
  }));
});

export function firstIssue(e: z.ZodError, section: string): string {
  const i = e.issues[0];
  const where = i?.path.length ? ` (${i.path.join(" › ")})` : "";
  return `${section}: ${i?.message ?? "invalid"}${where}`;
}
