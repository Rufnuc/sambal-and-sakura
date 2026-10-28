import { cache } from "react";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { DEFAULT_SITE_CONTENT, VALUE_ICONS, FAQ_GROUPS, SOCIAL_KEYS, type SiteContent } from "@/lib/site-content";
import { cleanText } from "@/server/sanitize";
import { MENU, CUSTOM_DISH_ID } from "@/lib/data/menu";

const MENU_IDS = new Set(MENU.map((m) => m.id));
// Built-in dishes, or ones the owner added (a deleted one simply stops showing on the home page).
const knownDish = (id: unknown): boolean => typeof id === "string" && (MENU_IDS.has(id) || CUSTOM_DISH_ID.test(id));
const dishId = z.string().max(60).refine(knownDish, "Pick a dish from the menu");
// Our own uploaded photos or an https link (e.g. Cloudinary); never javascript:, data: etc. Empty = use the dish's menu photo.
const photoUrl = z.string().trim().max(500).refine((s) => s === "" || (s.startsWith("/uploads/") && !s.includes("..")) || /^https:\/\/[^\s"'<>]+$/i.test(s), "Photos must be uploaded here or be an https link");

// Admin-editable site content, stored as one JSON Setting row with static defaults.
// getSiteContent() NEVER throws: if the database is unreachable (e.g. the very first build/deploy
// before migrations) the site simply renders with the built-in defaults.

const KEY = "siteContent";

// Owner-typed text, sanitised (see server/sanitize.ts). Line breaks are kept (FAQ answers etc.).
// Over-long text is trimmed rather than rejected, so an old saved value can never knock a whole
// section back to the defaults.
const str = (max: number, min = 0) => z.string().transform((v) => cleanText(v, { multiline: true }).slice(0, max)).pipe(z.string().min(min));
// Social profile links are always made into https web addresses: "instagram.com/x" gets https://
// added, http:// is upgraded, and any other scheme (javascript:, data:...) is dropped. It never fails,
// so a slightly-off saved link can't knock the whole business section (phone, address) back to defaults.
const httpsLink = str(200).transform((v) => {
  if (!v) return "";
  if (/^https:\/\//i.test(v)) return v;
  if (/^http:\/\//i.test(v)) return "https://" + v.slice(7);
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || /\s/.test(v)) return "";
  return "https://" + v.replace(/^\/+/, "");
});
const off = z.boolean().default(false);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

// The review link must be a Google https link, so a typo (or a pasted wrong link) can't send customers elsewhere.
const REVIEW_HOSTS = ["g.page", "google.com", "goo.gl", "g.co"];
const reviewUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    if (v === "") return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && REVIEW_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
    } catch {
      return false;
    }
  }, "Use the https link Google gives you (it starts with https://g.page/ or https://www.google.com/)")
  .default("");

const sessionSchema = z.object({ open: hhmm, close: hhmm }).refine((s) => s.open < s.close, "Closing time must be after opening time");
const daySchema = z.object({ day: str(10, 1), sessions: z.array(sessionSchema).max(4) });

const schemas = {
  business: z.object({
    tagline: str(120),
    blurb: str(400),
    phone: str(30, 5),
    email: z.string().trim().email().max(120),
    address: z.object({ line1: str(120), line2: str(120), city: str(80), postcode: str(12) }),
    mapQuery: str(200),
    googleReviewUrl: reviewUrl,
    // Saves from before the Google / Tripadvisor listings existed get the approved listings (switched on below).
    social: z.object({ google: httpsLink.default(DEFAULT_SITE_CONTENT.business.social.google), instagram: httpsLink, tiktok: httpsLink, facebook: httpsLink, rednote: httpsLink, wechat: str(80), tripadvisor: httpsLink.default(DEFAULT_SITE_CONTENT.business.social.tripadvisor) }),
    // Saved before the switches existed: everything starts off until the owner approves it.
    socialShow: z.object({ google: z.boolean().default(true), instagram: off, tiktok: off, facebook: off, rednote: off, wechat: off, tripadvisor: z.boolean().default(true) }).default(DEFAULT_SITE_CONTENT.business.socialShow),
    hours: z.array(daySchema).length(7),
  }),
  hero: z.object({
    badge: str(80), headlineStart: str(80), headlineAccent: str(60), headlineEnd: str(40),
    // Defaults: content saved before these existed must still validate (or the whole banner would reset).
    // A plate whose dish is no longer on the menu (e.g. saved for the previous menu) gets the default
    // dish for that plate, rather than failing and resetting the whole banner (headline included).
    images: z.preprocess(
      (v) => (Array.isArray(v) ? v.map((img, i) => (img && typeof img === "object" && knownDish((img as { dishId?: unknown }).dishId) ? img : DEFAULT_SITE_CONTENT.hero.images[i] ?? img)) : v),
      z.array(z.object({ dishId, photo: photoUrl })).length(3),
    ).default(DEFAULT_SITE_CONTENT.hero.images),
    featured: z.number().int().min(-1).max(2).default(DEFAULT_SITE_CONTENT.hero.featured),
  }),
  // Picks that are no longer on the menu are dropped (and if none are left, the default six are used).
  signature: z.object({
    dishIds: z.preprocess(
      (v) => {
        if (!Array.isArray(v)) return v;
        const kept = v.filter(knownDish);
        return kept.length || !v.length ? kept : DEFAULT_SITE_CONTENT.signature.dishIds;
      },
      z.array(dishId).max(6).refine((ids) => new Set(ids).size === ids.length, "Each dish can only be picked once"),
    ),
  }),
  // "sparkles" was retired (kept for AI features only): older saves get the cooking pot instead.
  valueStrip: z.array(z.object({ icon: z.preprocess((v) => (v === "sparkles" ? "pot" : v), z.enum(VALUE_ICONS)), title: str(70), text: str(160) })).max(6),
  cta: z.object({ heading: str(120), subtext: str(200) }),
  reviews: z.object({
    show: z.boolean(),
    sourceNote: str(120),
    items: z.array(z.object({
      id: str(40, 1), name: str(60, 1), rating: z.number().int().min(1).max(5),
      text: str(400, 1), dish: str(80).optional(), source: str(40), date: str(12),
    })).max(24),
  }),
  story: z.object({ show: z.boolean(), heading: str(80, 1), body: str(4000), photo: photoUrl }),
  faqs: z.array(z.object({ q: str(200, 1), a: str(1200, 1), group: z.enum(FAQ_GROUPS) })).max(60),
} as const;

export const siteContentSchema = z.object(schemas);

/** Layer saved values over the defaults, section by section; an invalid/missing section falls back. */
function resolve(raw: unknown): SiteContent {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_SITE_CONTENT } as Record<string, unknown>;
  for (const key of Object.keys(schemas) as (keyof typeof schemas)[]) {
    if (obj[key] === undefined) continue;
    const parsed = schemas[key].safeParse(obj[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return upgradeContactDefaults(upgradeDeliveryWording(out as unknown as SiteContent));
}

// The first defaults had made-up contact details that may still be sitting, untouched, in a saved copy:
// social profiles that were never set up, and a hello@ mailbox nobody reads. Exact copies of those are
// cleared (or swapped for the real order@ address); anything the owner typed is kept as they wrote it.
const OLD_SOCIAL: Record<string, string> = {
  instagram: "https://instagram.com/sambalandsakura",
  tiktok: "https://tiktok.com/@sambalandsakura",
  facebook: "https://facebook.com/sambalandsakura",
  rednote: "https://www.xiaohongshu.com/",
  wechat: "SambalSakura",
};
const OLD_EMAIL = "hello@sambalandsakura.co.uk";
// The first address and map details used "236-238"; the restaurant's door and Google listing say 236 (Oct 2026).
// The Google link was a search for the listing; it's now the listing's own Google Maps address.
const OLD_LINE1 = "236–238 Linthorpe Road";
const OLD_MAP_QUERY = "236-238 Linthorpe Rd, Middlesbrough TS1 3QP";
const OLD_GOOGLE = "https://www.google.com/search?kgmid=/g/11p27mv379&q=Sambal+%26+Sakura";
// The first phone number on the site, replaced by the restaurant's real one (as on Google) in Oct 2026.
const OLD_PHONE = "+44 1642 245888";
// The description written for the previous menu (Chinese & Japanese only, "katsu curry").
const OLD_BLURB = "Chinese classics and authentic Japanese specials in the heart of Middlesbrough - with sushi crafted by a chef trained in Japan, sizzling salt & pepper, aromatic crispy duck, katsu curry and signature boba.";
function upgradeContactDefaults(c: SiteContent): SiteContent {
  const b = c.business;
  const social = { ...b.social };
  for (const k of SOCIAL_KEYS) if (social[k] === OLD_SOCIAL[k]) social[k] = "";
  if (social.google === OLD_GOOGLE) social.google = DEFAULT_SITE_CONTENT.business.social.google;
  const address = b.address.line1 === OLD_LINE1 ? { ...b.address, line1: DEFAULT_SITE_CONTENT.business.address.line1 } : b.address;
  const mapQuery = b.mapQuery === OLD_MAP_QUERY ? DEFAULT_SITE_CONTENT.business.mapQuery : b.mapQuery;
  const email = b.email === OLD_EMAIL ? DEFAULT_SITE_CONTENT.business.email : b.email;
  const blurb = b.blurb === OLD_BLURB ? DEFAULT_SITE_CONTENT.business.blurb : b.blurb;
  const phone = b.phone.replace(/\s/g, "") === OLD_PHONE.replace(/\s/g, "") ? DEFAULT_SITE_CONTENT.business.phone : b.phone;
  return { ...c, business: { ...b, social, email, blurb, phone, address, mapQuery } };
}

// Older saves copied the delivery prices into the text ("Free delivery over £25 / From £1.99 across
// Middlesbrough."), so they never followed Delivery prices. Untouched copies of those old defaults
// become the live placeholders; anything the owner rewrote is left exactly as they wrote it.
const OLD_DELIVERY_TITLE = /^Free delivery (over|on) £\d+(\.\d\d)?\+?$/;
const OLD_DELIVERY_TEXT = /^(From £\d+\.\d\d across Middlesbrough\.|Within our delivery area\. Otherwise from £\d+\.\d\d; £\d+ minimum\.)$/;
const OLD_DELIVERY_FAQ = /^We deliver across Middlesbrough and the surrounding TS postcodes in three zones \(£[\d.]+–£[\d.]+\)\. Spend £\d+\+ and delivery is free\. Enter your postcode at checkout to confirm\.$/;
function upgradeDeliveryWording(c: SiteContent): SiteContent {
  const strip = c.valueStrip.map((v) =>
    v.icon === "bike" && OLD_DELIVERY_TITLE.test(v.title) && OLD_DELIVERY_TEXT.test(v.text) ? { ...v, title: "{deliveryTitle}", text: "{deliveryLine}" } : v);
  const newFaq = DEFAULT_SITE_CONTENT.faqs.find((f) => f.group === "delivery" && f.a.includes("{deliveryLine}"))?.a;
  const faqs = c.faqs.map((f) => (newFaq && OLD_DELIVERY_FAQ.test(f.a) ? { ...f, a: newFaq } : f));
  return { ...c, valueStrip: strip, faqs };
}

export const getSiteContent = cache(async (): Promise<SiteContent> => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    if (!row) return DEFAULT_SITE_CONTENT;
    return resolve(JSON.parse(row.value));
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
});

/** Fingerprint of what is stored right now. Lets the editor detect that someone else saved in the meantime. */
export async function getSiteContentVersion(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    return row ? createHash("sha1").update(row.value).digest("hex").slice(0, 16) : "default";
  } catch {
    return "default";
  }
}

export const CONFLICT_MESSAGE =
  "This page is out of date: the site content was changed somewhere else since you opened it. Reload to see the latest, then make your change again.";

/**
 * Validates the full content object and saves it. Returns the issues if invalid.
 * If `baseVersion` is given and no longer matches what is stored, nothing is saved (a stale copy of the
 * editor must not silently undo someone else's change).
 */
export async function setSiteContent(
  input: unknown,
  baseVersion?: string,
): Promise<{ ok: true; content: SiteContent; version: string } | { ok: false; error: string; conflict?: boolean }> {
  if (baseVersion !== undefined && baseVersion !== (await getSiteContentVersion())) {
    return { ok: false, error: CONFLICT_MESSAGE, conflict: true };
  }
  const parsed = siteContentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(" > ") || "content"}: ${issue.message}` };
  }
  const value = JSON.stringify(parsed.data);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return { ok: true, content: parsed.data as unknown as SiteContent, version: createHash("sha1").update(value).digest("hex").slice(0, 16) };
}
