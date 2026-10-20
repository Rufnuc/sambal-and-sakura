import { SITE_URL } from "@/lib/site-url";
import { LEGAL_SLUGS } from "@/server/legal";

// sitemap.xml for search engines: every public page at the one canonical address (SITE_URL, the www
// domain). Private pages (admin, account, tracking) are left out and blocked in robots.ts.
// It links a stylesheet (/sitemap.xsl) so a person opening it in a browser sees a readable page;
// search engines ignore the stylesheet. No <lastmod>: Google only trusts it when it reflects real
// content changes, and stamping "now" on every request teaches it to ignore the dates.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/menu", "/order", "/book", "/offers", "/contact", "/careers", ...LEGAL_SLUGS.map((s) => `/legal/${s}`)];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const urls = PAGES.map((p) => `  <url><loc>${esc(SITE_URL + p)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl?v=2"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
