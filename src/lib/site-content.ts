// Admin-editable website content: shared by server pages, client components and the admin editor.
// This module has NO server-only imports. Static defaults come from lib/data/site.ts; whatever the
// restaurant saves in Admin -> Site content is stored in the database and layered on top.
import { RESTAURANT, FAQS, ORDERING, type DayHours, type Testimonial, type Faq } from "@/lib/data/site";

export const VALUE_ICONS = ["banknote", "bike", "sparkles", "chef", "leaf", "clock", "star", "gift", "shield", "heart"] as const;
export type ValueIcon = (typeof VALUE_ICONS)[number];

export const FAQ_GROUPS = ["ordering", "delivery", "booking", "payment", "allergens", "policies"] as const;

export interface ValueItem { icon: ValueIcon; title: string; text: string }

/** One of the three stacked plates in the top banner: a dish, shown with its menu photo unless `photo` is set. */
export interface HeroImage { dishId: string; photo: string }

export interface SiteContent {
  business: {
    tagline: string;
    blurb: string;
    phone: string;
    email: string;
    address: { line1: string; line2: string; city: string; postcode: string };
    mapQuery: string;
    googleReviewUrl: string; // where /review sends people (the "write a review" link from Google Business Profile)
    social: { instagram: string; tiktok: string; facebook: string; rednote: string; wechat: string };
    hours: DayHours[]; // index 0 = Sunday
  };
  hero: {
    badge: string; headlineStart: string; headlineAccent: string; headlineEnd: string;
    images: HeroImage[];  // exactly 3 plates (front-left, back-right, bottom-right)
    featured: number;     // which plate's name is shown on the small card (0-2), or -1 for no card
  };
  signature: { dishIds: string[] }; // "Signature dishes" on the home page, in order; empty = chosen automatically
  valueStrip: ValueItem[];
  cta: { heading: string; subtext: string };
  reviews: { show: boolean; sourceNote: string; items: Testimonial[] };
  faqs: Faq[];
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  business: {
    tagline: RESTAURANT.tagline,
    blurb: RESTAURANT.blurb,
    phone: RESTAURANT.phone,
    email: RESTAURANT.email,
    address: {
      line1: RESTAURANT.address.line1, line2: RESTAURANT.address.line2,
      city: RESTAURANT.address.city, postcode: RESTAURANT.address.postcode,
    },
    mapQuery: RESTAURANT.mapQuery,
    googleReviewUrl: "",
    social: { ...RESTAURANT.social },
    hours: RESTAURANT.hours.map((h) => ({ day: h.day, sessions: h.sessions.map((s) => ({ ...s })) })),
  },
  hero: {
    badge: "Sushi crafted by a chef trained in Japan",
    headlineStart: "Where chili meets ",
    headlineAccent: "cherry blossom",
    headlineEnd: ".",
    images: [
      { dishId: "chicken-katsu-don", photo: "" },
      { dishId: "duck-half", photo: "" },
      { dishId: "sp-king-prawns", photo: "" },
    ],
    featured: 1,
  },
  signature: { dishIds: [] },
  valueStrip: [
    { icon: "banknote", title: "Cash only", text: "Pay on delivery or collection - simple and secure." },
    { icon: "bike", title: `Free delivery over £${ORDERING.freeDeliveryThreshold}`, text: `From £${ORDERING.deliveryZones[0].fee.toFixed(2)} across Middlesbrough.` },
    { icon: "chef", title: "Sushi by a Japan-trained chef", text: "Authentic Japanese technique, prepared to order." },
    { icon: "sparkles", title: "Freshly made to order", text: "Authentic Chinese & Japanese, cooked when you order." },
  ],
  cta: {
    heading: "Hungry yet? Order direct and taste the difference.",
    subtext: "Rewards on every order, and food made to be remembered.",
  },
  // Off and empty until the owner adds GENUINE reviews (with permission). The demo testimonials
  // are fictional: publishing them would be a fake-review offence under the DMCC Act 2024.
  reviews: {
    show: false,
    sourceNote: "",
    items: [],
  },
  faqs: FAQS.map((f) => ({ ...f })),
};

/** `tel:` link from a display phone number, e.g. "+44 1642 245888" -> "tel:+441642245888". */
export function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

export function averageRating(items: Testimonial[]): string {
  if (!items.length) return "";
  return (items.reduce((s, t) => s + t.rating, 0) / items.length).toFixed(1);
}

export function formatAddress(a: SiteContent["business"]["address"], withPostcode = true): string {
  return [a.line1, a.line2, a.city, withPostcode ? a.postcode : ""].filter(Boolean).join(", ");
}
