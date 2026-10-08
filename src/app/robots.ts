import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Built on each request (not at build time) so it always reflects the SITE_URL the site is running with.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/staff", "/account", "/api/", "/print/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
