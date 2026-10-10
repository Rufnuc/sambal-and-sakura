import { buildFacts } from "@/server/facts";
import { RESTAURANT } from "@/lib/data/site";
import { SITE_URL } from "@/lib/site-url";

// A short, plain-text description of the site for AI assistants (the emerging /llms.txt convention).
// Built live from the admin-edited data. Note: no major AI provider has confirmed they read this file,
// so treat it as a cheap extra, not the main way to be found.
export const dynamic = "force-dynamic";

export async function GET() {
  const { summary, facts } = await buildFacts();
  const body = [
    `# ${RESTAURANT.name}`,
    "",
    `> ${summary}`,
    "",
    "## Key facts",
    "",
    ...facts.map((f) => `- **${f.label}:** ${f.value}`),
    "",
    "## Pages",
    "",
    `- [Home](${SITE_URL}/): overview, opening hours, signature dishes`,
    `- [Menu](${SITE_URL}/menu): every dish with price, allergens and vegetarian/vegan marking`,
    `- [Order online](${SITE_URL}/order): delivery or collection`,
    `- [Book a table](${SITE_URL}/book): table reservations`,
    `- [Offers](${SITE_URL}/offers): current offers and the Fortune Wheel`,
    `- [Contact and FAQ](${SITE_URL}/contact): address, hours, map, delivery area and frequently asked questions`,
    `- [Careers](${SITE_URL}/careers): current job openings`,
    "",
    "## Optional",
    "",
    `- [Full menu as plain text](${SITE_URL}/llms-full.txt)`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
