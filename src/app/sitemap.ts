import type { MetadataRoute } from "next";

const BASE = "https://sambalandsakura.co.uk";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["", "/menu", "/order", "/book", "/offers", "/careers", "/contact", "/faq", "/legal/privacy", "/legal/terms", "/legal/accessibility"];
  return routes.map((r) => ({
    url: BASE + r,
    lastModified: now,
    changeFrequency: r === "/menu" || r === "/offers" ? "weekly" : "monthly",
    priority: r === "" ? 1 : r === "/menu" || r === "/order" || r === "/book" ? 0.9 : 0.6,
  }));
}
