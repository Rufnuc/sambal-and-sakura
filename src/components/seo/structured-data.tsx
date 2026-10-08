import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { averageRating } from "@/lib/site-content";
import { CATEGORY_LABELS } from "@/lib/data/menu";

const CATEGORY_LABELS_FOR_SEO = Object.values(CATEGORY_LABELS);

/** FAQPage schema - helps answer engines (Google AI, etc.) surface answers. */
export async function FaqJsonLd() {
  const { faqs } = await getSiteContent();
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
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function RestaurantJsonLd() {
  const { business: b, reviews } = await getSiteContent();
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
    name: RESTAURANT.name,
    description: b.blurb,
    servesCuisine: ["Chinese", "Japanese", "Asian"],
    priceRange: "££",
    telephone: b.phone,
    email: b.email,
    url: "https://sambalandsakura.co.uk",
    acceptsReservations: "True",
    paymentAccepted: "Cash",
    menu: "https://sambalandsakura.co.uk/menu",
    address: {
      "@type": "PostalAddress",
      streetAddress: b.address.line1,
      addressLocality: b.address.city,
      postalCode: b.address.postcode,
      addressCountry: "GB",
    },
    geo: { "@type": "GeoCoordinates", latitude: 54.5705, longitude: -1.2355 },
    openingHoursSpecification,
    sameAs: [b.social.instagram, b.social.tiktok, b.social.facebook].filter(Boolean),
    ...(showRating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: averageRating(reviews.items), reviewCount: reviews.items.length, bestRating: 5 } } : {}),
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: CATEGORY_LABELS_FOR_SEO.map((label) => ({ "@type": "MenuSection", name: label })),
    },
  };

  return (
    <script
      type="application/ld+json"
      // JSON-LD is static, server-rendered, and safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
