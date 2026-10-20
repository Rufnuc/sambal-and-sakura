import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Built on each request (not at build time) so it always reflects the SITE_URL the site is running with.
export const dynamic = "force-dynamic";

// Private areas: never crawled.
const PRIVATE = ["/admin", "/staff", "/account", "/api/", "/print/", "/review", "/track/", "/unsubscribe"];

// AI assistants and AI search engines are welcome on the public pages (people ask them "where can I
// get Chinese food near me?"). Listed by name so a host or CDN default that blocks AI bots can't
// silently hide the site from them. If you put Cloudflare in front, also turn OFF its
// "Block AI bots" / "AI Crawl Control" setting, which otherwise blocks these at the edge.
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",                // OpenAI
  "ClaudeBot", "Claude-SearchBot", "Claude-User",           // Anthropic
  "PerplexityBot", "Perplexity-User",                        // Perplexity
  "Google-Extended", "Applebot", "Applebot-Extended",        // Gemini / Apple Intelligence
  "Bingbot", "DuckAssistBot", "Meta-ExternalAgent", "MistralAI-User", "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`, // the www address: the only one that isn't a redirect
  };
}
