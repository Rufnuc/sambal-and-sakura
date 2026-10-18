import { getSiteContent } from "@/server/site-content";
import { getDeliveryRules, getZones } from "@/server/config";
import { gbpShort } from "@/lib/format";
import type { SiteContent } from "@/lib/site-content";

// Site content as customers see it: placeholders in the home highlights and the FAQs are filled in from
// the live Delivery prices (Admin -> Settings) and delivery zones, so changing a price there updates the
// wording everywhere without retyping it. The admin editor keeps the placeholders.

export const DELIVERY_TOKENS = ["{deliveryTitle}", "{deliveryLine}", "{freeOver}", "{deliveryFrom}", "{deliveryRange}", "{minOrder}"] as const;

export async function getLiveSiteContent(): Promise<SiteContent> {
  const [content, rules, zones] = await Promise.all([getSiteContent(), getDeliveryRules(), getZones()]);
  const fees = zones.map((z) => z.fee);
  const from = fees.length ? Math.min(...fees) : null;
  const to = fees.length ? Math.max(...fees) : null;
  const free = rules.freeDeliveryOver;
  const range = from === null ? "" : from === to ? gbpShort(from) : `${gbpShort(from)}–${gbpShort(to!)}`;
  const values: Record<(typeof DELIVERY_TOKENS)[number], string> = {
    "{deliveryTitle}": free !== null ? (free === 0 ? "Free delivery" : `Free delivery on ${gbpShort(free)}+`) : from !== null ? `Delivery from ${gbpShort(from)}` : "Delivery",
    "{deliveryLine}": [
      free === 0 ? "Delivery is free across our delivery area." : from !== null ? `Delivery from ${gbpShort(from)}${free !== null ? `, free on ${gbpShort(free)} or more` : ""}.` : "",
      rules.minOrder > 0 ? `${gbpShort(rules.minOrder)} minimum.` : "",
    ].filter(Boolean).join(" "),
    "{freeOver}": free !== null ? gbpShort(free) : "",
    "{deliveryFrom}": from !== null ? gbpShort(from) : "",
    "{deliveryRange}": range,
    "{minOrder}": gbpShort(rules.minOrder),
  };
  const fill = (s: string) => s.replace(/\{(deliveryTitle|deliveryLine|freeOver|deliveryFrom|deliveryRange|minOrder)\}/g, (t) => values[t as keyof typeof values]);
  return {
    ...content,
    valueStrip: content.valueStrip.map((v) => ({ ...v, title: fill(v.title), text: fill(v.text) })),
    faqs: content.faqs.map((f) => ({ ...f, q: fill(f.q), a: fill(f.a) })),
  };
}
