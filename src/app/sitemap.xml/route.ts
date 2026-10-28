
import { SITE_URL } from "@/lib/site-url";
import { LEGAL_SLUGS } from "@/server/legal";
import { getCategories, getPublicMenu } from "@/server/config";
import { getSiteContent } from "@/server/site-content";

export const dynamic = "force-dynamic";

const BASE_URL = SITE_URL.replace(/\/+$/, "");

const PAGES = [
  "/",
  "/menu",
  "/order",
  "/book",
  "/offers",
  "/contact",
  "/careers",
  ...LEGAL_SLUGS.map((slug) => `/legal/${slug}`),
];

/** Each menu section's own page (/menu/<category>), for the categories that are shown and have dishes. */
async function menuSectionPages(): Promise<string[]> {
  try {
    const [cats, menu] = await Promise.all([getCategories(), getPublicMenu()]);
    return cats.filter((c) => !c.hidden && menu.some((m) => m.category === c.id)).map((c) => `/menu/${c.id}`);
  } catch {
    return []; // database unreachable: the fixed pages are still listed
  }
}

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const storyOn = (await getSiteContent()).story.show; // only listed while it's switched on
  const pages = [...PAGES.slice(0, 2), ...(await menuSectionPages()), ...PAGES.slice(2), ...(storyOn ? ["/our-story"] : [])];
  const urls = pages.map((page) => {
    const loc = new URL(page, `${BASE_URL}/`).toString();

    return `  <url><loc>${esc(loc)}</loc></url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
