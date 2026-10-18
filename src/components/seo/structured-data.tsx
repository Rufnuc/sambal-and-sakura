import { RESTAURANT } from "@/lib/data/site";
import { getLiveSiteContent } from "@/server/live-content";
import { getSiteContent } from "@/server/site-content";
import { getMaxMiles } from "@/server/config";
import { averageRating } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site-url";
import type { MenuCategoryCfg, MenuItem } from "@/lib/data/menu";

/**
 * Serialise structured data for a <script type="application/ld+json"> tag. Escaping "<" stops text typed
 * into the admin (FAQ answers, dish names...) containing "</script>" from breaking out of the tag.
 */
export function ld(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const LAT = 54.5705, LON = -1.2355; // 236-238 Linthorpe Road, Middlesbrough

/** FAQPage schema - helps answer engines (Google AI, ChatGPT search, Perplexity...) quote the answers. */
export async function FaqJsonLd() {
  const { faqs } = await getLiveSiteContent();
  if (!faqs.length) return null;
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(data) }} />;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEB_PLATFORMS = ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"];

export async function RestaurantJsonLd() {
  const [{ business: b, reviews }, maxMiles] = await Promise.all([getSiteContent(), getMaxMiles()]);
  // Only advertise a rating if the site is actually showing reviews.
  const showRating = reviews.show && reviews.items.length > 0;

  const openingHoursSpecification = b.hours.flatMap((h, i) =>
    h.sessions.map((s) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_NAMES[i],
      opens: s.open,
      closes: s.close,
    })),
  );

  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#restaurant`,
    name: RESTAURANT.name,
    // People type "and" - tell search and AI tools both spellings are the same business.
    alternateName: ["Sambal and Sakura", "SambalandSakura"],
    image: `${SITE_URL}/opengraph-image`,
    description: b.blurb,
    servesCuisine: ["Chinese", "Japanese", "Asian"],
    priceRange: "££",
    telephone: b.phone,
    email: b.email,
    url: SITE_URL,
    acceptsReservations: "True",
    paymentAccepted: "Cash",
    currenciesAccepted: "GBP",
    menu: `${SITE_URL}/menu`,
    hasMenu: `${SITE_URL}/menu`,
    address: {
      "@type": "PostalAddress",
      streetAddress: b.address.line1,
      addressLocality: b.address.city,
      postalCode: b.address.postcode,
      addressCountry: "GB",
    },
    geo: { "@type": "GeoCoordinates", latitude: LAT, longitude: LON },
    // Where delivery is available (the admin-set maximum distance), in metres.
    ...(maxMiles > 0
      ? { areaServed: { "@type": "GeoCircle", geoMidpoint: { "@type": "GeoCoordinates", latitude: LAT, longitude: LON }, geoRadius: Math.round(maxMiles * 1609.34) } }
      : {}),
    openingHoursSpecification,
    // What a customer (or an AI agent acting for them) can DO here.
    potentialAction: [
      {
        "@type": "OrderAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/order`, inLanguage: "en-GB", actionPlatform: WEB_PLATFORMS },
        deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet", "http://purl.org/goodrelations/v1#DeliveryModePickUp"],
      },
      {
        "@type": "ReserveAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/book`, inLanguage: "en-GB", actionPlatform: WEB_PLATFORMS },
        result: { "@type": "Reservation", name: "Table reservation" },
      },
    ],
    sameAs: [b.social.instagram, b.social.tiktok, b.social.facebook].filter(Boolean),
    ...(showRating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: averageRating(reviews.items), reviewCount: reviews.items.length, bestRating: 5 } } : {}),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(data) }} />;
}

/** Tells search/AI tools the site's name (and that "and" / "&" are the same) so brand searches resolve correctly. */
export function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: RESTAURANT.name,
    alternateName: ["Sambal and Sakura", "SambalandSakura"],
    url: SITE_URL,
    inLanguage: "en-GB",
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(data) }} />;
}

const DIET: Record<string, string> = {
  vegetarian: "https://schema.org/VegetarianDiet",
  vegan: "https://schema.org/VeganDiet",
};

/** The full menu as structured data: every dish with its price and diet, so "does X do katsu curry / how much is it" can be answered. */
export function MenuJsonLd({ menu, categories }: { menu: MenuItem[]; categories: MenuCategoryCfg[] }) {
  const sections = categories
    .map((cat) => ({
      "@type": "MenuSection",
      name: cat.label,
      hasMenuItem: menu
        .filter((m) => m.category === cat.id)
        .map((m) => {
          const diets = m.tags.filter((t) => DIET[t]).map((t) => DIET[t]);
          return {
            "@type": "MenuItem",
            name: m.name,
            description: m.description,
            ...(diets.length ? { suitableForDiet: diets } : {}),
            offers: {
              "@type": "Offer",
              price: m.price.toFixed(2),
              priceCurrency: "GBP",
              availability: m.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            },
          };
        }),
    }))
    .filter((s) => s.hasMenuItem.length > 0);

  const data = {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${SITE_URL}/menu#menu`,
    name: `${RESTAURANT.name} menu`,
    url: `${SITE_URL}/menu`,
    inLanguage: "en-GB",
    hasMenuSection: sections,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(data) }} />;
}
