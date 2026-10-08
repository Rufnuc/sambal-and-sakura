import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/server/db";
import { DEFAULT_SITE_CONTENT, VALUE_ICONS, FAQ_GROUPS, type SiteContent } from "@/lib/site-content";

// Admin-editable site content, stored as one JSON Setting row with static defaults.
// getSiteContent() NEVER throws: if the database is unreachable (e.g. the very first build/deploy
// before migrations) the site simply renders with the built-in defaults.

const KEY = "siteContent";

const str = (max: number) => z.string().trim().max(max);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const sessionSchema = z.object({ open: hhmm, close: hhmm }).refine((s) => s.open < s.close, "Closing time must be after opening time");
const daySchema = z.object({ day: str(10).min(1), sessions: z.array(sessionSchema).max(4) });

const schemas = {
  business: z.object({
    tagline: str(120),
    blurb: str(400),
    phone: str(30).min(5),
    email: z.string().trim().email().max(120),
    address: z.object({ line1: str(120), line2: str(120), city: str(80), postcode: str(12) }),
    mapQuery: str(200),
    social: z.object({ instagram: str(200), tiktok: str(200), facebook: str(200), rednote: str(200), wechat: str(80) }),
    hours: z.array(daySchema).length(7),
  }),
  hero: z.object({ badge: str(80), headlineStart: str(80), headlineAccent: str(60), headlineEnd: str(40) }),
  valueStrip: z.array(z.object({ icon: z.enum(VALUE_ICONS), title: str(70), text: str(160) })).max(6),
  cta: z.object({ heading: str(120), subtext: str(200) }),
  reviews: z.object({
    show: z.boolean(),
    sourceNote: str(120),
    items: z.array(z.object({
      id: str(40).min(1), name: str(60).min(1), rating: z.number().int().min(1).max(5),
      text: str(400).min(1), dish: str(80).optional(), source: str(40), date: str(12),
    })).max(24),
  }),
  faqs: z.array(z.object({ q: str(200).min(1), a: str(1200).min(1), group: z.enum(FAQ_GROUPS) })).max(60),
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
  return out as unknown as SiteContent;
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

/** Validates the full content object and saves it. Returns the issues if invalid. */
export async function setSiteContent(input: unknown): Promise<{ ok: true; content: SiteContent } | { ok: false; error: string }> {
  const parsed = siteContentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(" > ") || "content"}: ${issue.message}` };
  }
  const value = JSON.stringify(parsed.data);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return { ok: true, content: parsed.data as unknown as SiteContent };
}
