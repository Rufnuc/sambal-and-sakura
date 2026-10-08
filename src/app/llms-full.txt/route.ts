import { buildFacts, menuAsText } from "@/server/facts";
import { getEffectiveMenu } from "@/server/config";
import { RESTAURANT } from "@/lib/data/site";

// The full menu (names, prices, descriptions, allergens, diets) as plain text for AI assistants.
export const dynamic = "force-dynamic";

export async function GET() {
  const [{ summary }, menu] = await Promise.all([buildFacts(), getEffectiveMenu()]);
  const body = [
    `# ${RESTAURANT.name} - full menu`,
    "",
    `> ${summary}`,
    "",
    "Prices are in GBP. Items marked \"from\" depend on the protein or options chosen. Allergen information is a guide: for allergies, phone the restaurant to confirm before ordering.",
    "",
    menuAsText(menu),
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
