// Sambal & Sakura - site content & operational config.
// These are the built-in defaults. Everything customers see (phone, email, address, hours, social
// profiles) is edited in Admin -> Site content, which is saved in the database and wins over this file.

export interface HoursSession { open: string; close: string }
export interface DayHours { day: string; sessions: HoursSession[] }

// The legal entity behind the site (Companies House). A limited company's website must show its
// registered name, number, place of registration and registered office (Companies (Trading
// Disclosures) Regulations 2008) - shown in the footer and on the legal pages.
export const COMPANY = {
  name: "SAMBAL & SAKURA LIMITED",
  number: "17437275",
  registeredIn: "England and Wales",
  registeredOffice: "236-238 Linthorpe Road, Middlesbrough, England, TS1 3QP",
};
// The public Companies House record: an independent, official source for who runs the restaurant.
export const COMPANIES_HOUSE_URL = `https://find-and-update.company-information.service.gov.uk/company/${COMPANY.number}`;

export const RESTAURANT = {
  name: "Sambal & Sakura",
  tagline: "Where chili meets cherry blossom.",
  blurb:
    "Chinese classics, Japanese sushi and Malaysian favourites in the heart of Middlesbrough - with sushi crafted by a chef trained in Japan, sizzling salt & pepper, aromatic crispy duck, nasi lemak, rendang and signature boba.",
  halal: true,
  phone: "07716 757789", // the restaurant's number, as on its Google Business Profile
  email: "order@sambalandsakura.co.uk",
  address: {
    line1: "236 Linthorpe Road", // as on the door and Google Maps (the registered office above is 236-238)
    line2: "",
    city: "Middlesbrough",
    postcode: "TS1 3QP",
    country: "United Kingdom",
  },
  mapQuery: "Sambal & Sakura, 236 Linthorpe Rd, Middlesbrough TS1 3QP",
  // The pin on the restaurant's Google Maps listing (October 2026): used for the structured data, the
  // delivery-distance check and "how far am I". mapsUrl is that listing's permanent Google Maps address.
  geo: { lat: 54.5695309, lon: -1.2388349 },
  mapsUrl: "https://maps.google.com/?cid=11037661416925001811",
  // Each profile is added and switched on in Admin -> Site content once it exists. Tripadvisor and the
  // Google Business Profile (Google's id /g/11p27mv379) are the restaurant's approved listings (October 2026).
  social: { google: "https://maps.google.com/?cid=11037661416925001811", instagram: "", tiktok: "", facebook: "", rednote: "", wechat: "", tripadvisor: "https://www.tripadvisor.com/Restaurant_Review-g186340-d34750959-Reviews-Sambal_Sakura-Middlesbrough_North_Yorkshire_England.html" },
  // index 0 = Sunday. Real trading hours (split lunch/dinner Tue–Sat).
  hours: [
    { day: "Sun", sessions: [{ open: "11:30", close: "22:00" }] },
    { day: "Mon", sessions: [] }, // closed
    { day: "Tue", sessions: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:00" }] },
    { day: "Wed", sessions: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:00" }] },
    { day: "Thu", sessions: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:00" }] },
    { day: "Fri", sessions: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:30" }] },
    { day: "Sat", sessions: [{ open: "11:30", close: "14:00" }, { open: "17:00", close: "22:30" }] },
  ] as DayHours[],
};

// Cash only.
export const ORDERING = {
  cashOnly: true,
  minOrder: 12,
  freeDeliveryThreshold: 25,
  prepTimeMins: 25, // lower bound, used for "best time to leave" estimates
  prepTimeMin: 25,
  prepTimeMax: 45,
  maxDeliveryMiles: 6, // default; editable in admin Settings
  asapCutoffBeforeCloseMins: 45,
  deliveryZones: [
    { id: "z1", label: "Zone 1 - Town Centre", postcodes: ["TS1", "TS2", "TS3"], fee: 1.99, etaMins: 30 },
    { id: "z2", label: "Zone 2 - Inner", postcodes: ["TS4", "TS5", "TS6"], fee: 2.99, etaMins: 40 },
    { id: "z3", label: "Zone 3 - Outer", postcodes: ["TS7", "TS8", "TS17", "TS18"], fee: 3.99, etaMins: 55 },
  ],
};

export type OrderStatus =
  | "received" | "preparing" | "out-for-delivery" | "ready-for-collection" | "completed" | "cancelled";

export const ORDER_STATUS_FLOW: { id: OrderStatus; label: string }[] = [
  { id: "received", label: "Order received" },
  { id: "preparing", label: "Preparing" },
  { id: "out-for-delivery", label: "Out for delivery" },
  { id: "ready-for-collection", label: "Ready for collection" },
  { id: "completed", label: "Completed" },
];

export interface Offer {
  id: string; title: string; description: string; code?: string;
  badge?: string; terms: string; kind: "percent" | "freebie" | "bundle" | "first-order";
  // What the code gives at checkout (exactly one, when there's a code). Set in Admin → Promotions.
  pctOff?: number;        // % off the food
  amountOff?: number;     // £ off
  freeItemId?: string;    // a dish added free
  minSpend?: number;      // food total needed (£)
  firstOrderOnly?: boolean;   // only for phones/accounts that haven't ordered before (one first-order offer per customer)
  oncePerCustomer?: boolean;  // each phone number can use it once
  hidden?: boolean;           // code works but isn't shown on the Offers page (flyers, emails, staff)
}
export const OFFERS: Offer[] = [
  { id: "first10", title: "10% off your first direct order", description: "New here? Order on the website and save instantly.",
    code: "SAKURA10", badge: "First order", kind: "first-order", terms: "Min spend £15 of food. First website order only, one per customer.",
    pctOff: 10, minSpend: 15, firstOrderOnly: true },
  { id: "feast5", title: "£5 off orders of £40 or more", description: "Ordering for the family or a group? Take £5 off a £40+ order.",
    code: "FEAST5", badge: "Groups", kind: "bundle", terms: "Min spend £40 of food. Website orders only. Cannot be combined with other codes.",
    amountOff: 5, minSpend: 40 },
  { id: "sweet35", title: "Free Bubur Cha Cha on £35+", description: "Spend £35 or more and we'll add our Nyonya-Malay coconut dessert, free.",
    code: "SWEET35", badge: "Freebie", kind: "freebie", terms: "Min spend £35 of food. One free dessert per order. Cannot be combined with other codes.",
    freeItemId: "m136-bubur-cha-cha", minSpend: 35 },
  { id: "welcome10", title: "10% off for first-time customers", description: "For flyers, emails and staff to hand out.",
    code: "WELCOME10", kind: "first-order", terms: "Min spend £12. First order only.",
    pctOff: 10, minSpend: 12, firstOrderOnly: true, hidden: true },
];

export interface Testimonial {
  id: string; name: string; rating: number; text: string; dish?: string; source: string; date: string;
}
export const TESTIMONIALS: Testimonial[] = [
  { id: "t1", name: "Priya M.", rating: 5, dish: "Aromatic Crispy Duck", source: "Google", date: "2026-08-14",
    text: "The crispy duck is the best in Middlesbrough - proper pancakes and loads of it." },
  { id: "t2", name: "James O.", rating: 5, dish: "Salt & Pepper King Prawns", source: "Google", date: "2026-09-02",
    text: "Salt & pepper king prawns are unreal, and the chicken katsu don is a proper portion. Collection was bang on time." },
  { id: "t3", name: "Mei L.", rating: 5, dish: "Honey Chilli Chicken", source: "TripAdvisor", date: "2026-07-21",
    text: "Honey chilli chicken with a boba on the side - perfect. Staff are lovely and the fortune wheel gave me a free dessert!" },
  { id: "t4", name: "Daniel K.", rating: 4, dish: "Chicken Katsu Curry Don", source: "Google", date: "2026-09-19",
    text: "Great katsu, crisp panko. Booked a table online for 6 and it was seamless - no waiting around." },
  { id: "t5", name: "Sofia R.", rating: 5, dish: "Brown Sugar Boba Tea", source: "Instagram", date: "2026-10-01",
    text: "Came for the boba, stayed for the dim sum. Warm, friendly and genuinely great food. Will be back." },
];

export interface Faq { q: string; a: string; group: "ordering" | "delivery" | "booking" | "payment" | "allergens" | "policies" }
export const FAQS: Faq[] = [
  { group: "payment", q: "What payment methods do you accept?",
    a: "Website orders are cash only - pay the driver on delivery or on collection. We show this clearly throughout checkout so there are no surprises." },
  { group: "delivery", q: "Where do you deliver and how much is it?",
    a: "We deliver across Middlesbrough and the surrounding TS postcodes. {deliveryLine} Enter your postcode at checkout to see the price for your address." },
  { group: "delivery", q: "How long will my order take?",
    a: "Typical prep is ~25 minutes. Delivery ETAs run 30–55 minutes by zone. You can also schedule an order for later." },
  { group: "booking", q: "Can I book a table online?",
    a: "Absolutely. Pick a date, time, and party size - we hold live capacity and always protect a share of tables for walk-ins so service stays relaxed." },
  { group: "booking", q: "What happens if my preferred slot is full?",
    a: "Join the waitlist in one tap. If a table frees up we'll offer it to you automatically in order." },
  { group: "allergens", q: "Do you cater for allergies and diets?",
    a: "Every dish lists allergens and diet tags (vegetarian, vegan, spicy). Our kitchen handles nuts, shellfish and gluten - if you have any allergy, please tell us before ordering and we'll do our best, but we can't guarantee zero cross-contact." },
  { group: "policies", q: "What's your cancellation policy?",
    a: "Bookings are free to cancel from your account or by phone - please let us know at least 2 hours before if you can. Orders can be cancelled online for a few minutes after ordering (see your tracking page); after that the kitchen may already be cooking, so please call us." },
];

// amount: % off for "percent", £ off for "voucher" (must match the label customers see).
// freeItemId: for "freebie" prizes, the dish added free to the order when the reward code is used.
export interface WheelPrize { id: string; label: string; kind: "percent" | "freebie" | "voucher" | "none"; weight: number; color: "gold" | "red" | "pink" | "charcoal"; amount?: number; freeItemId?: string }
export const WHEEL_PRIZES: WheelPrize[] = [
  { id: "p10", label: "10% off", kind: "percent", amount: 10, weight: 22, color: "gold" },
  { id: "freedrink", label: "Free drink", kind: "freebie", weight: 18, color: "pink", freeItemId: "soft-drink" },
  { id: "freeside", label: "Free prawn crackers", kind: "freebie", weight: 14, color: "red", freeItemId: "prawn-crackers" },
  { id: "freedessert", label: "Free dessert", kind: "freebie", weight: 10, color: "pink", freeItemId: "m136-bubur-cha-cha" },
  { id: "v5", label: "£5 next order", kind: "voucher", amount: 5, weight: 12, color: "gold" },
  { id: "p15", label: "15% off", kind: "percent", amount: 15, weight: 6, color: "gold" },
  { id: "again", label: "So close!", kind: "none", weight: 18, color: "charcoal" },
];

export const ANALYTICS_EVENTS = [
  "view_menu", "add_to_cart", "begin_checkout", "order_placed",
  "booking_started", "booking_confirmed", "spin_wheel_played", "voucher_redeemed",
  "dish_assistant_ask",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
