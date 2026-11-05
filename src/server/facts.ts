import { RESTAURANT, ORDERING, COMPANY } from "@/lib/data/site";
import { MAX_ONLINE_PARTY } from "@/lib/data/tables";
import { allergensKnown, optionPriceText, type MenuCategoryCfg, type MenuItem } from "@/lib/data/menu";
import { formatHours, sessionDelivers } from "@/lib/hours";
import { formatAddress } from "@/lib/site-content";
import { getSiteContent } from "@/server/site-content";
import { getZones, getMaxMiles, getEffectiveMenu, getReferralConfig, getDeliveryRules, getCategories, getOnlineDiscount, activeOnlineDiscount } from "@/server/config";
import { getDisabledZones } from "@/server/settings";
import { getWeChatConfig } from "@/server/wechat";
import { gbpShort } from "@/lib/format";

// One source of plain-language facts about the restaurant, built from the LIVE admin-edited data
// (hours, delivery zones, mileage, menu). Used for the visible "at a glance" block on the Contact page
// and for /llms.txt, so the website, search engines and AI tools always agree.

export interface Fact { label: string; value: string }

const gbp = gbpShort;
// Monday first (data index 0 = Sunday).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export async function buildFacts(): Promise<{ summary: string; facts: Fact[] }> {
  const [{ business: b }, zones, disabled, maxMiles, menu, referral, delivery, cats, od] = await Promise.all([
    getSiteContent(), getZones(), getDisabledZones(), getMaxMiles(), getEffectiveMenu(), getReferralConfig(), getDeliveryRules(), getCategories(), getOnlineDiscount(),
  ]);
  const online = activeOnlineDiscount(od);

  const liveZones = zones.filter((z) => !disabled.includes(z.id));
  const categories = cats
    .filter((c) => menu.some((m) => m.category === c.id))
    .map((c) => c.label);

  const summary =
    `${RESTAURANT.name} (also written Sambal and Sakura) is a Chinese, Japanese and Malaysian restaurant in ${b.address.city}, ` +
    `at ${formatAddress(b.address)}. ${b.blurb}`;

  const facts: Fact[] = [
    { label: "Address", value: formatAddress(b.address) },
    { label: "Phone", value: b.phone },
    { label: "Email", value: b.email },
    {
      label: "Opening hours",
      value: DAY_ORDER.map((i) => `${b.hours[i].day}: ${formatHours(b.hours[i], i)}`).join("; "),
    },
    { label: "Ways to order", value: "Delivery or collection online, or book a table." },
    {
      label: "Table bookings",
      value: `Book online for parties of up to ${MAX_ONLINE_PARTY}. Larger groups should phone ${b.phone}.`,
    },
  ];

  if (liveZones.length) {
    facts.push({
      label: "Delivery",
      value:
        liveZones.map((z) => `${z.label.replace(/^Zone \d+ - /, "")} (${z.postcodes.join(", ")}): ${gbp(z.fee)}, about ${z.etaMins} minutes`).join("; ") +
        (delivery.freeDeliveryOver !== null ? `. Free delivery on orders of ${gbp(delivery.freeDeliveryOver)} or more` : "") +
        `. Minimum delivery order ${gbp(delivery.minOrder)}.` +
        // e.g. "No delivery at lunchtime on Tue, Wed, Thu, Fri, Sat (11:30-14:00): collection only then."
        (() => {
          const off = DAY_ORDER.flatMap((i) => b.hours[i].sessions.filter((s) => !sessionDelivers(s, i)).map((s) => ({ day: b.hours[i].day, s })));
          return off.length ? ` No delivery on ${[...new Set(off.map((o) => o.day))].join(", ")} during ${[...new Set(off.map((o) => `${o.s.open}-${o.s.close}`))].join(" / ")}: collection only then.` : "";
        })() +
        (maxMiles > 0 ? ` Delivery is available within about ${maxMiles} miles.` : ""),
    });
  }

  if (online) {
    facts.push({
      label: "Ordering direct",
      value: `Orders placed on this website get ${online.pctOff}% off the food${online.appliesTo !== "all" ? ` (${online.appliesTo} orders)` : ""}${online.minSpend > 0 ? ` when the food comes to ${gbp(online.minSpend)} or more` : ""}. No code is needed.`,
    });
  }

  if (referral.enabled) {
    facts.push({
      label: "Refer a friend",
      value: `New customers who sign up with a friend's link get ${gbp(referral.give)} off their first order (food ${gbp(referral.minSpend)} or more); the friend who referred them gets ${gbp(referral.get)} off once that order is completed.`,
    });
  }

  facts.push(
    { label: "Collection", value: `Ready in about ${ORDERING.prepTimeMin} to ${ORDERING.prepTimeMax} minutes.` },
    {
      label: "Payment",
      value: getWeChatConfig()
        ? "Cash on delivery or collection. WeChat Pay is also available when ordering online."
        : "Cash on delivery or collection.",
    },
    {
      label: "Allergies and diets",
      // Only claim "every dish" once the kitchen has actually listed allergens for every dish.
      value: menu.every(allergensKnown)
        ? `Allergens and vegetarian/vegan options are marked on every dish. For allergies, phone ${b.phone} to confirm before ordering.`
        : `Allergen information is being added to the menu. If you have an allergy or dietary need, phone ${b.phone} before ordering and the kitchen will advise.`,
    },
  );
  if (RESTAURANT.halal) facts.push({ label: "Halal", value: "All food is halal." });
  facts.push(
    { label: "Menu", value: categories.join(", ") },
    { label: "Website languages", value: "English, Chinese (中文), Vietnamese (Tiếng Việt) and Japanese (日本語)." },
    // Who runs it, checkable on the public Companies House register.
    { label: "Operated by", value: `${COMPANY.name}, a company registered in ${COMPANY.registeredIn} (company number ${COMPANY.number}).` },
  );

  return { summary, facts };
}

/** Plain-text version of the whole menu, for /llms-full.txt. */
export function menuAsText(menu: MenuItem[], categories: MenuCategoryCfg[]): string {
  const lines: string[] = [];
  for (const cat of categories) {
    const items = menu.filter((m) => m.category === cat.id);
    if (!items.length) continue;
    lines.push(`## ${cat.label}`, "");
    for (const m of items) {
      const from = m.modifiers && m.modifiers.length > 0 ? "from " : "";
      const diet = m.tags.includes("vegan") ? " Vegan." : m.tags.includes("vegetarian") ? " Vegetarian." : "";
      const spice = m.spiceLevel ? ` Spice level ${m.spiceLevel}/3.` : "";
      const allergens = m.allergens.length ? ` Contains: ${m.allergens.join(", ")}.` : m.allergensChecked ? " None of the 14 major allergens." : " Allergens: not listed yet, ask the restaurant.";
      const sold = m.soldOut ? " (currently unavailable)" : "";
      const price = m.phoneOrder ? (m.price ? `${gbp(m.price)}, phone to order` : "seasonal price, phone to order") : `${from}${gbp(m.price)}`;
      const options = optionPriceText(m);
      lines.push(`- ${m.name} (${price})${sold}: ${m.description}${options && !m.phoneOrder ? ` Prices: ${options}.` : ""}${diet}${spice}${allergens}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
