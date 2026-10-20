import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";
import { LEGAL_SLUGS } from "@/server/legal";

// Built on each request (not at build time) so it always reflects the SITE_URL the site is running with.
export const dynamic = "force-dynamic";

// Every public page Google should index, at the one canonical address (SITE_URL, the www domain).
// Private pages (admin, account, tracking, checkout internals) are left out and blocked in robots.ts.
// No <lastmod>: Google only trusts it when it reflects real content changes, and stamping "now" on
// every request teaches it to ignore the sitemap's dates. <changefreq>/<priority> are ignored by Google.
const PAGES = ["", "/menu", "/order", "/book", "/offers", "/contact", "/careers"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [...PAGES, ...LEGAL_SLUGS.map((s) => `/legal/${s}`)].map((path) => ({ url: `${SITE_URL}${path || "/"}` }));
}
