import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

const BASE = SITE_URL;

// Built on each request (not at build time) so it always reflects the SITE_URL the site is running with.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["", "/menu", "/order", "/book", "/offers", "/careers", "/contact", "/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/promotions", "/legal/accessibility"];
  return routes.map((r) => ({
    url: BASE + r,
    lastModified: now,
    changeFrequency: r === "/menu" || r === "/offers" ? "weekly" : "monthly",
    priority: r === "" ? 1 : r === "/menu" || r === "/order" || r === "/book" ? 0.9 : 0.6,
  }));
}
