import { COMPANY, RESTAURANT } from "@/lib/data/site";
import { MAX_ONLINE_PARTY, BOOKING_POLICY } from "@/lib/data/tables";
import { formatAddress } from "@/lib/site-content";
import { gbpShort } from "@/lib/format";
import { getSiteContent } from "@/server/site-content";
import { getCancelPolicy } from "@/server/cancellations";
import { getPromotions } from "@/server/promotions";
import { getReferralConfig, getMaxMiles, getDeliveryRules } from "@/server/config";
import { wechatAvailable } from "@/server/wechat";
import { ORDER_PII_DAYS, BOOKING_PII_DAYS, EVENT_DAYS } from "@/server/retention";
import { CUSTOMER_SESSION_DAYS, STAFF_SESSION_HOURS } from "@/server/auth";
import { REACTIVATE_DAYS } from "@/server/accounts";
import { WELCOME_POINTS, REDEEM_STEP, REDEEM_VALUE, REDEEM_DAYS } from "@/server/points";
import { LOYALTY_POINTS_PER_POUND } from "@/server/pricing";
import { REFERRAL_REWARD_DAYS, QUALIFY_DAYS } from "@/server/referrals";

// The website's legal pages (privacy, terms, cookies, promotions, accessibility).
// Numbers are read from the LIVE settings and the constants the code actually uses (cancel policy,
// retention periods, points, referral amounts, which providers are switched on), so the published
// text always matches what the site does. Change behaviour in code/admin, and these pages follow.
// Drafted 16 Oct 2026 from a gap analysis (Egede Mgt/legal-review/). Not reviewed by a solicitor yet.
//
// Text format: "**bold**" and "[link text](/path)" are rendered by the legal page.

export type Block = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };
export interface LegalSection { id: string; h: string; body: Block[] }
export interface LegalDoc { title: string; updated: string; summary: string; sections: LegalSection[] }

export const LEGAL_UPDATED = "16 October 2026";
export const LEGAL_SLUGS = ["privacy", "terms", "cookies", "promotions", "accessibility"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
export const isLegalSlug = (s: string): s is LegalSlug => (LEGAL_SLUGS as readonly string[]).includes(s);

const days = (n: number) => (n % 365 === 0 ? `${n / 365} year${n === 365 ? "" : "s"}` : `${n} days`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function facts() {
  const [{ business: b }, cancel, promos, referral, maxMiles, delivery] = await Promise.all([
    getSiteContent(), getCancelPolicy(), getPromotions(), getReferralConfig(), getMaxMiles(), getDeliveryRules(),
  ]);
  const env = process.env;
  return {
    phone: b.phone,
    email: b.email,
    address: formatAddress(b.address),
    cancel, promos, referral, maxMiles, delivery,
    wechat: wechatAvailable(),
    // Which outside services are switched on (keys set), so the privacy policy lists only real recipients.
    on: {
      brevo: !!env.BREVO_API_KEY,
      cloudinary: !!env.CLOUDINARY_CLOUD_NAME,
      turnstile: !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      groq: !!env.GROQ_API_KEY,
      google: !!env.GOOGLE_TRANSLATE_API_KEY,
      microsoft: !!env.MICROSOFT_TRANSLATOR_KEY,
      libre: !!(env.LIBRETRANSLATE_URL || env.LIBRETRANSLATE_API_KEY || env.LIBRETRANSLATE_PUBLIC),
      printnode: !!env.PRINTNODE_API_KEY,
      alerts: !!env.ALERT_WEBHOOK_URL,
    },
  };
}
type Facts = Awaited<ReturnType<typeof facts>>;

function companyLine(f: Facts) {
  return `${RESTAURANT.name} is the trading name of **${COMPANY.name}**, a company registered in ${COMPANY.registeredIn} (company number ${COMPANY.number}). Registered office: ${COMPANY.registeredOffice}. Restaurant: ${f.address}. Phone ${f.phone}, email [${f.email}](mailto:${f.email}).`;
}

function cancelRule(f: Facts): string[] {
  const c = f.cancel;
  const lines = [
    `We count cancelled orders (including orders not collected or not accepted on delivery) over the last ${c.windowDays} days. Cancellations you make yourself count if they're on your account, or on an order with both your phone number and your email address; orders not collected count by phone number or email address.`,
    `At ${plural(c.flagAt, "cancelled order")}, we may phone you to confirm new orders before we cook them.`,
  ];
  if (c.restrictAction === "block-cash-delivery") {
    lines.push(`At ${plural(c.restrictAt, "cancelled order")}, cash-on-delivery and online cancelling are switched off for you automatically. Collection, and paying online where available, still work.`);
  }
  lines.push(`This is done automatically. If you think it's wrong, call us on ${f.phone} and a member of staff will look at it and can reset it.`);
  return lines;
}

/* ------------------------------------------------------------------------------------ Privacy */

function privacy(f: Facts): LegalDoc {
  const vendors: string[][] = [
    ["Render", "Hosts the website", "Everything the site stores", "EU (Frankfurt) / US"],
    ["Neon", "Database", "Everything the site stores", "EU"],
    ["IONOS", "Our domain name and email inbox", "Emails you send us (including CVs)", "EU / UK"],
  ];
  if (f.on.brevo) vendors.push(["Brevo", "Sends order, booking and account emails, promotional emails if you opted in, and job applications to our inbox", "Name, email address, email content (and CVs for job applications)", "EU"]);
  if (f.on.printnode) vendors.push(["PrintNode", "Prints orders on the kitchen printer", "Order details: name, phone, address, items, notes", "UK / EU"]);
  if (f.wechat) vendors.push(["WeChat Pay (Tenpay)", "Takes payment if you choose WeChat Pay", "Order number and amount; WeChat holds your payment details", "China"]);
  if (f.on.turnstile) vendors.push(["Cloudflare Turnstile", "Checks you're not a bot on some forms", "Technical information about your browser and IP address", "Global (incl. US)"]);
  if (f.on.groq) vendors.push(["Groq", "Powers the \"Ask about this\" dish assistant", "The question you type and the dish's menu details", "US"]);
  if (f.on.google) vendors.push(["Google Cloud Translation", "Translates the site into other languages", "Text on the page you are viewing", "US / global"]);
  if (f.on.microsoft) vendors.push(["Microsoft Translator", "Translates the site into other languages", "Text on the page you are viewing", "US / global"]);
  if (f.on.libre) vendors.push(["LibreTranslate", "Translates the site into other languages", "Text on the page you are viewing", "Outside the UK"]);
  if (f.on.cloudinary) vendors.push(["Cloudinary", "Stores menu photos", "No customer data", "US"]);
  vendors.push(
    ["postcodes.io and OSRM", "Checks your postcode and delivery distance", "Your postcode or map location (no name)", "UK / EU"],
    ["Google Maps", "Shows our location map, only if you accept cookies", "Technical information Google collects when the map loads", "US / global"],
  );
  if (f.on.alerts) vendors.push(["ntfy (owner phone alerts)", "Alerts the owner about problems, e.g. a printer fault", "Order number, total and any cancellation reason you give", "EU / US"]);

  return {
    title: "Privacy Policy",
    updated: LEGAL_UPDATED,
    summary: "How we collect, use, share and protect your personal information when you order, book a table, create an account or use this website, and the rights you have under UK data protection law.",
    sections: [
      { id: "who", h: "Who we are", body: [
        companyLine(f),
        `We are the "controller" of your personal information, which means we decide how it is used. We don't have a data protection officer; for anything about your data, contact us using the details above.`,
      ] },
      { id: "short", h: "The short version", body: [{ list: [
        "We use your details to cook, deliver and keep track of your orders and bookings, and to run your account and rewards.",
        "We only send promotional emails if you switch them on, and every one has an unsubscribe link.",
        "We never sell your information.",
        "Optional cookies (visit statistics and the Google map) are only used if you click Accept. You can change your mind with Cookie settings at the bottom of every page.",
        `We remove your name and contact details from old orders after ${days(ORDER_PII_DAYS)} and from old bookings after ${days(BOOKING_PII_DAYS)}.`,
        "You can download or delete your data from your account page at any time.",
      ] }] },
      { id: "collect", h: "What we collect", body: [
        { table: { head: ["Information", "Examples", "When"], rows: [
          ["Order details", "Name, phone number, email address (optional), delivery address and postcode, what you ordered, notes for the kitchen or driver, how you paid", "When you place an order"],
          ["Booking details", "Name, phone, email, date, time, party size, occasion, dietary or allergy notes, other notes", "When you book a table"],
          ["Account details", "Name, email, phone, password (stored only as a scrambled hash we can't read), language, whether you want offer emails, points, rewards, your referral code and who referred you, your order and booking history", "When you create and use an account"],
          ["Allergy and dietary information", "Anything you tell us about allergies, intolerances or diets", "Only if you choose to tell us"],
          ["Questions to the dish assistant", "The question you type into \"Ask about this\"", "When you use it"],
          ["Messages and job applications", "Emails you send us; job applications from the Careers page (name, email, phone, message and CV)", "When you contact us or apply for a job"],
          ["Technical information", "IP address (kept briefly to stop abuse), a login cookie, items kept in your browser (see our [Cookie Policy](/legal/cookies)) and, if you accept, anonymous visit statistics", "When you use the site"],
        ] } },
        "To fulfil an order we need your name and phone number, and for delivery your address. Without them we can't take the order. Everything else is optional.",
      ] },
      { id: "use", h: "How we use it and why we're allowed to", body: [
        "UK data protection law requires a legal reason (a \"lawful basis\") for each use:",
        { table: { head: ["What we do", "Lawful basis"], rows: [
          ["Take, cook, deliver and track your order; take payment; handle problems and refunds", "Contract: we need it to do what you asked"],
          ["Manage your table booking, including a reminder email the day before", "Contract"],
          ["Run your account, points, rewards, offers and referrals", "Contract"],
          ["Send order, booking and account emails (these aren't marketing)", "Contract"],
          ["Send promotional emails", "Consent: only if you switch on \"Offers by email\". You can switch it off at any time"],
          ["Prevent fraud and misuse (e.g. rate limits, bot checks, the cancellation rule below, blocking reuse of rewards) and keep the site secure", "Legitimate interests: protecting the business and our customers"],
          ["Keep records of what staff do in our admin system", "Legitimate interests: security and accountability"],
          ["Answer your questions and complaints; improve our food and service", "Legitimate interests"],
          ["Consider your job application", "Steps you asked us to take before a possible employment contract, and legitimate interests (recruiting staff)"],
          ["Count anonymous visits and page use", "Consent: only if you accept cookies"],
          ["Keep accounting and tax records", "Legal obligation"],
          ["Use allergy and dietary information", "Explicit consent (see below)"],
        ] } },
        "Where we rely on legitimate interests, we have weighed them against your rights. You can object at any time (see Your rights).",
      ] },
      { id: "allergies", h: "Allergy and dietary information", body: [
        "Information about allergies or intolerances can be health information, which the law protects more strictly. We only use it if you choose to give it to us, and only to prepare your food or table safely. Staff see it on the kitchen ticket and in the booking. By giving it, you explicitly consent to this use. You can ask us to remove it at any time, but tell the restaurant directly about any allergy before you eat.",
        `For a serious allergy, please call us on ${f.phone} before ordering, as well as adding a note.`,
      ] },
      { id: "cancellations", h: "Automatic decisions: the cancellation rule", body: [
        "To protect the kitchen from food being cooked and then refused, the site automatically keeps count of cancellations:",
        { list: cancelRule(f) },
      ] },
      { id: "marketing", h: "Promotional emails", body: [
        "We only send promotional emails (offers, news) if you switch on \"Offers by email\" in your account. We record when you did. Every promotional email has an unsubscribe link, and you can switch it off in your account at any time. Order, booking and account emails are part of the service and are sent either way.",
      ] },
      { id: "share", h: "Who we share it with", body: [
        "We never sell your information. Our staff and delivery drivers see what they need to prepare and deliver your order. We also use these service providers, who handle data for us under contract and only on our instructions:",
        { table: { head: ["Provider", "What for", "What they receive", "Where"], rows: vendors } },
        "We may also share information if the law requires it (for example with the police or HMRC), to protect our rights, or with a buyer if the business is sold (they would have to treat your information in line with this policy).",
      ] },
      { id: "transfers", h: "Information sent outside the UK", body: [
        "Some providers above store or handle information outside the UK. When that happens we make sure it is protected, either because the UK government has approved the country (for example the EU, and US companies certified under the UK-US \"data bridge\"), or by using the UK's approved contract terms (the International Data Transfer Agreement or the UK Addendum). Contact us for more details.",
      ] },
      { id: "keep", h: "How long we keep it", body: [{ list: [
        `**Orders:** your name, phone, email, address and notes are removed automatically ${days(ORDER_PII_DAYS)} after the order. We keep what was ordered and the amounts, without your details, for our accounts.`,
        `**Bookings:** your name, phone, email and notes are removed automatically ${days(BOOKING_PII_DAYS)} after the booking date.`,
        `**Accounts:** kept while you use them. If you deactivate your account you can restore it within ${REACTIVATE_DAYS} days; after that, or straight away if you close it, your personal details are removed. We keep a scrambled code made from your email so the same email can't sign up again for new-customer offers.`,
        `**Logins:** you stay signed in for up to ${CUSTOMER_SESSION_DAYS} days (staff ${STAFF_SESSION_HOURS} hours).`,
        `**Anonymous visit statistics:** deleted after ${EVENT_DAYS} days.`,
        "**Abuse-prevention records** (such as IP addresses used for rate limits) are deleted when they expire, usually within hours to a day.",
        "**Promotional email list:** until you unsubscribe or close your account.",
        "**Emails and CVs** sent to us (including through the Careers page, which emails them to us and doesn't store them on the website): deleted when no longer needed; CVs within 6 months unless you ask us to keep yours.",
      ] }] },
      { id: "rights", h: "Your rights", body: [
        "You have the right to:",
        { list: [
          "**Access** a copy of your information. Signed-in customers can use \"Download my data\" on the account page.",
          "**Correct** anything that's wrong. You can edit most details in your account.",
          "**Delete** your information. You can close your account yourself, or ask us.",
          "**Restrict** or **object** to how we use it, including an absolute right to stop promotional emails.",
          "**Move** your information to another service (data portability).",
          "**Withdraw consent** at any time, for promotional emails, cookies or allergy information, without affecting what we did before.",
          "Ask for a **person to review** an automatic decision, such as the cancellation rule.",
        ] },
        `To use any of these rights, email [${f.email}](mailto:${f.email}) or call ${f.phone}. It's free. We may ask you to confirm who you are, and we'll reply within one month (we'll tell you if a complex request needs longer).`,
      ] },
      { id: "security", h: "Keeping it safe", body: [
        "The site only works over encrypted connections. Passwords are stored as one-way hashes. Staff accounts have limited permissions and their actions are logged. Order tracking links contain a secret code so only you can open your order. If something goes wrong that puts your information at risk, we will deal with it and tell the Information Commissioner's Office (ICO), and you, when the law requires.",
      ] },
      { id: "children", h: "Children", body: [
        "This site isn't aimed at children. If you are under 16, please ask a parent or guardian before ordering or creating an account.",
      ] },
      { id: "complaints", h: "Complaints", body: [
        "If you're unhappy with how we've handled your information, please tell us first so we can put it right. You can also complain to the Information Commissioner's Office: [ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint/) or 0303 123 1113.",
      ] },
      { id: "changes", h: "Changes to this policy", body: [
        "We'll update this page when the way we use information changes, and change the date at the top. For significant changes we'll also tell account holders by email.",
      ] },
    ],
  };
}

/* -------------------------------------------------------------------------------------- Terms */

function terms(f: Facts): LegalDoc {
  const c = f.cancel;
  const deposit = BOOKING_POLICY.depositThresholdParty;
  return {
    title: "Terms & Conditions",
    updated: LEGAL_UPDATED,
    summary: "The terms that apply when you order food for delivery or collection, book a table, or use an account, points or offers on this website.",
    sections: [
      { id: "about", h: "About us and these terms", body: [
        companyLine(f),
        "These terms apply when you order, book a table, or use an account on this website. Please read them before ordering. They don't affect your legal rights as a consumer. This site is for personal (not business) use.",
        "The site can be shown in other languages using automatic translation. If a translation differs from the English text, the English text applies.",
      ] },
      { id: "order", h: "Placing an order", body: [
        "When you place an order, the site shows a confirmation and, if you gave an email address, emails you one. That is when the contract between us is made.",
        "We may decline or cancel an order, and refund anything you paid online, if: your address is outside our delivery area; an item has run out; there is an obvious pricing mistake; we are closed or too busy to cook it in time; or we reasonably suspect fraud or misuse. We'll tell you as soon as we can.",
        "Please check your order, address and phone number before sending it. We'll phone you if we have a question.",
      ] },
      { id: "price", h: "Prices and payment", body: [
        "Prices are in pounds sterling and include any VAT that applies. Before you order, checkout shows the total you'll pay, including any delivery fee and discounts.",
        f.wechat
          ? "You can pay **in cash** when your order is delivered or collected, or **by WeChat Pay** online. WeChat Pay refunds go back to your WeChat account."
          : "You pay **in cash** when your order is delivered or collected.",
        "If a price on the site is obviously wrong, we'll contact you before cooking and you can choose to go ahead at the correct price or cancel.",
      ] },
      { id: "delivery", h: "Delivery and collection", body: [{ list: [
        `We deliver to the postcodes shown at checkout${f.maxMiles > 0 ? `, within about ${f.maxMiles} miles of the restaurant` : ""}. The delivery fee for your area is shown before you order.`,
        `The minimum order for delivery is ${gbpShort(f.delivery.minOrder)} of food.${f.delivery.freeDeliveryOver !== null ? ` Delivery is free on orders of ${gbpShort(f.delivery.freeDeliveryOver)} or more of food.` : ""}`,
        "Delivery and collection times are estimates. We'll do our best, but busy times, traffic and weather can cause delays.",
        "If nobody answers when we deliver, we'll try to phone you. If we can't hand over the order, we may have to take it back. A cash order that can't be delivered counts as a cancelled order (see below).",
        "For collection, please come at the time shown. We can't keep food hot indefinitely.",
      ] }] },
      { id: "cancel", h: "Changing or cancelling an order", body: [
        c.customerCancelMinutes > 0
          ? `You can cancel online from your order tracking page within ${plural(c.customerCancelMinutes, "minute")} of ordering, or, for an order scheduled for later, until ${plural(c.scheduledCutoffMinutes, "minute")} before the time it's for. After that the kitchen may already be cooking. Call us on ${f.phone} and we'll help if we can.`
          : `To change or cancel an order, call us on ${f.phone} as soon as possible. Once we've started cooking we may not be able to cancel it.`,
        "Because food is made to order and goes off quickly, the usual 14-day right to cancel for online purchases doesn't apply to food orders.",
        "If an online payment is cancelled, we refund it in full to the way you paid.",
      ] },
      { id: "problems", h: "If something is wrong with your order", body: [
        `If anything is missing, wrong, or not of the quality you'd expect, tell us as soon as possible, ideally while you still have the food, on ${f.phone} or at [${f.email}](mailto:${f.email}). A photo helps. We'll put it right with a replacement, a refund or a credit, as appropriate. Under the Consumer Rights Act 2015, food must be as described, of satisfactory quality and fit for purpose. Nothing in these terms affects those rights.`,
      ] },
      { id: "repeat-cancels", h: "Repeated cancellations", body: [
        "Cooking food that isn't wanted wastes food and costs us money, so the site applies an automatic rule:",
        { list: cancelRule(f) },
      ] },
      { id: "allergens", h: "Allergies and dietary needs", body: [
        "Each dish on the menu lists its allergens, and vegetarian and vegan dishes are marked. Our kitchen handles all 14 major allergens (including peanuts, nuts, sesame, gluten, crustaceans, fish, egg, milk and soya), so we can't guarantee any dish is free from traces.",
        `**If you have an allergy, call us on ${f.phone} before ordering** so the kitchen can confirm, and add it as a note to your order. You can also ask our staff or driver about allergens when your food is delivered or collected.`,
        "The \"Ask about this\" assistant is an automated AI tool. Its answers are general guidance only, may be wrong, and must not be relied on for allergies. Always confirm with our staff.",
      ] },
      { id: "bookings", h: "Table bookings", body: [{ list: [
        `You can book online for up to ${MAX_ONLINE_PARTY} people. For larger groups, please phone us.`,
        `Groups of ${deposit} or more need a deposit of ${gbpShort(BOOKING_POLICY.depositPerHead)} per person. We'll phone you to confirm the booking and take the deposit, and explain then when it's refundable.`,
        `Your booking is confirmed on screen and by email. You can cancel free of charge from your account or by calling ${f.phone}. Please tell us at least 2 hours before if you can, and let us know if you'll be late, so we can give the table to someone else.`,
        "If bookings are repeatedly not turned up to, we may ask you to phone to book in future.",
      ] }] },
      { id: "accounts", h: "Your account", body: [{ list: [
        "Please give accurate details and keep your password private. You're responsible for orders placed from your account.",
        "One account per person. We may suspend or close accounts used for fraud or to misuse offers, and cancel any rewards obtained that way.",
        `You can deactivate your account (and restore it within ${REACTIVATE_DAYS} days) or close it permanently from the account page. Closing removes your personal details and unused points and rewards. The same email can't be used to sign up again.`,
      ] }] },
      { id: "points", h: "Loyalty points", body: [{ list: [
        `When you order while signed in, you earn ${LOYALTY_POINTS_PER_POUND} points for every £1 of food (after discounts). Delivery fees don't earn points. New accounts also get ${WELCOME_POINTS} welcome points, which become usable after your first completed order.`,
        "Points are pending until your order is completed. Points from a cancelled order are removed.",
        `${REDEEM_STEP} points can be swapped for a ${gbpShort(REDEEM_VALUE)} voucher, which must be used within ${REDEEM_DAYS} days.`,
        "Points and vouchers have no cash value and can't be transferred or sold.",
        "We may change or end the points scheme. We'll give account holders at least 30 days' notice by email first, so you can use your confirmed points.",
      ] }] },
      { id: "promotions", h: "Offers, the Fortune Wheel and referrals", body: [
        "Offer codes, the Fortune Wheel and refer-a-friend rewards have their own rules in our [Promotion Terms](/legal/promotions), which form part of these terms.",
      ] },
      { id: "site", h: "Using this website", body: [
        "We try to keep menu details, prices, photos and opening times accurate, but photos are for illustration and dishes may vary slightly. Please don't misuse the site, for example by placing fake orders, trying to get around rate limits or rewards rules, or interfering with its security.",
      ] },
      { id: "liability", h: "Our responsibility to you", body: [
        "If we break these terms, we're responsible for loss or damage you suffer that is a foreseeable result. We're not responsible for loss that isn't foreseeable, or for business losses (the site is for personal use).",
        "Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law doesn't allow us to limit, including your rights under the Consumer Rights Act 2015.",
        "We're not responsible for delays or failures caused by events outside our reasonable control (for example severe weather, power or internet failures, or supplier problems). If that happens we'll tell you and refund anything you've paid for an order we can't fulfil.",
      ] },
      { id: "complaints", h: "Complaints", body: [
        `Please tell us if you're unhappy: call ${f.phone}, email [${f.email}](mailto:${f.email}), or speak to us in the restaurant. We aim to reply within 5 working days.`,
      ] },
      { id: "law", h: "Changes and governing law", body: [
        "We may update these terms from time to time. The version on this page when you place an order or booking applies to it.",
        "These terms are governed by the law of England and Wales. You can bring proceedings in the courts of England and Wales, or, if you live in Scotland or Northern Ireland, in your local courts.",
      ] },
    ],
  };
}

/* -------------------------------------------------------------------------------------- Cookies */

function cookies(): LegalDoc {
  return {
    title: "Cookie Policy",
    updated: LEGAL_UPDATED,
    summary: "The cookies and similar browser storage this website uses, which are essential and which are optional, and how to change your choice.",
    sections: [
      { id: "what", h: "What this covers", body: [
        "Cookies are small files a website saves in your browser. Sites can also save information in your browser's \"local storage\". The law treats both the same way. Essential ones don't need your consent. Optional ones do, so we only use those if you click **Accept** on the cookie banner.",
      ] },
      { id: "change", h: "Changing your choice", body: [
        "Click **Cookie settings** at the bottom of any page to show the banner again and change your choice. You can also delete cookies and site data in your browser settings.",
      ] },
      { id: "essential", h: "Essential (always on)", body: [
        { table: { head: ["Name", "What it does", "How long"], rows: [
          ["__Host-ss_session", "Keeps you signed in, if you sign in", `Up to ${CUSTOMER_SESSION_DAYS} days (staff ${STAFF_SESSION_HOURS} hours)`],
          ["ss_locale", "Remembers the language you chose", "1 year"],
          ["ss_cart (local storage)", "Remembers what's in your basket", "Until you order or clear it"],
          ["ss_consent (local storage)", "Remembers your cookie choice", "Until you change it"],
          ["ss_ref, ss_ref_banner (browser storage)", "Remembers a friend's referral code from a link you followed", "Until you sign up, or the end of your visit"],
          ["ss_tr_… (local storage)", "Keeps translations of pages you've viewed, so they load faster", "Until you clear site data"],
          ["Cloudflare Turnstile", "Bot check on some forms (when switched on). Cloudflare may set its own essential cookies", "Short-lived"],
        ] } },
        "Staff using our admin pages also have settings saved in their browser (for example order-alert sound). These aren't used for customers.",
      ] },
      { id: "optional", h: "Optional (only if you accept)", body: [
        { table: { head: ["What", "What it does", "How long"], rows: [
          ["Visit statistics (our own)", "Counts things like pages viewed and items added to baskets, without your name, IP address or contact details, so we can improve the site. No cookie is set; it only runs if you accept.", `Records deleted after ${EVENT_DAYS} days`],
          ["Google Maps", "Shows our location map on the contact and home pages. Google may set its own cookies when the map loads; see [Google's privacy policy](https://policies.google.com/privacy).", "Set by Google"],
        ] } },
        "We don't use advertising or tracking cookies, and we don't share browsing data with advertisers.",
      ] },
    ],
  };
}

/* ----------------------------------------------------------------------------------- Promotions */

function promotions(f: Facts): LegalDoc {
  const r = f.referral;
  const grace = (k: "offers" | "wheel" | "referral") => f.promos[k].graceDays;
  return {
    title: "Promotion Terms",
    updated: LEGAL_UPDATED,
    summary: "The rules for offer codes, first-order discounts, the Fortune Wheel, refer-a-friend rewards and loyalty vouchers.",
    sections: [
      { id: "promoter", h: "Promoter", body: [
        `All promotions are run by ${COMPANY.name} (trading as ${RESTAURANT.name}), registered office ${COMPANY.registeredOffice}. Company number ${COMPANY.number}.`,
      ] },
      { id: "general", h: "Rules for all promotions", body: [{ list: [
        "Promotions apply to orders placed on this website for delivery or collection, unless an offer says otherwise.",
        "Each offer's own conditions (such as minimum spend, days or times, and expiry) are shown with it on the Offers page or at checkout, and apply as well as these rules.",
        "One discount per order unless an offer says it can be combined. Rewards and codes have no cash value, can't be exchanged for cash and can't be transferred or sold.",
        "Minimum spends are worked out on food, before delivery fees.",
        "We may end or change a promotion at any time, for example if stock runs out. When we switch a promotion off, rewards already given out stay usable for the grace period stated below (but never after their own expiry date).",
        "We may refuse or cancel a discount or reward that has been obtained unfairly, for example through multiple accounts, false details or referring yourself, and we may close the accounts involved.",
        "If an order is cancelled, a reward from your account that was used on it is returned to your account if it's still in date.",
      ] }] },
      { id: "codes", h: "Offer codes and first-order offers", body: [{ list: [
        "Enter the code at checkout. The discount is worked out and shown before you order.",
        "**First-order offers** (for example WELCOME10) are only for customers who haven't ordered from us before. We check this using your account and phone number. Cancelled orders don't count.",
        "Codes marked one per customer can be used once per person (account and phone number).",
        `If we switch offer codes off, codes already given out stay usable for ${plural(grace("offers"), "day")}.`,
      ] }] },
      { id: "wheel", h: "The Fortune Wheel", body: [{ list: [
        "Open to signed-in customers who have placed at least one order. One spin per account every 7 days.",
        "The price of your food is the same whether or not you spin, and spinning is free.",
        "Each spin's result is chosen at random by our server. The prizes available are shown on the Offers page, and some spins don't win a prize.",
        "Prizes are saved to your account as a code to use at checkout within 7 days. They can't be combined with first-order offers.",
        `If we switch the wheel off, prizes already won stay usable for ${plural(grace("wheel"), "day")} (but not past their own 7-day expiry).`,
      ] }] },
      { id: "referral", h: "Refer a friend", body: [
        r.enabled
          ? { list: [
              "Share your referral link or code with a friend who has never ordered from us.",
              `Your friend creates an account using it and gets ${gbpShort(r.give)} off their first order of ${gbpShort(r.minSpend)} or more of food.`,
              `When that order is completed within ${QUALIFY_DAYS} days of them signing up, you get a ${gbpShort(r.get)} voucher.`,
              `Both rewards expire ${REFERRAL_REWARD_DAYS} days after they're given. Your friend's reward is a first-order offer, so it can't be combined with other first-order offers.`,
              `One referral per new customer and phone number. You can earn up to ${r.maxPerUser} referral rewards. Orders from your own phone number or delivered to your own address don't count. You can't refer yourself or an account you control.`,
              `If we switch referrals off, rewards already given out stay usable for ${plural(grace("referral"), "day")}.`,
            ] }
          : "Refer-a-friend isn't running at the moment. Rewards already given out can still be used until they expire.",
      ] },
      { id: "points", h: "Loyalty vouchers", body: [
        `Points and points vouchers are explained in our [Terms & Conditions](/legal/terms#points). In short: ${REDEEM_STEP} points make a ${gbpShort(REDEEM_VALUE)} voucher, valid for ${REDEEM_DAYS} days.`,
      ] },
      { id: "contact", h: "Questions", body: [
        `Questions about a promotion: call ${f.phone} or email [${f.email}](mailto:${f.email}).`,
      ] },
    ],
  };
}

/* -------------------------------------------------------------------------------- Accessibility */

function accessibility(f: Facts): LegalDoc {
  return {
    title: "Accessibility Statement",
    updated: LEGAL_UPDATED,
    summary: "Our commitment to making this website usable for everyone, what we've done so far, and how to get help or report a problem.",
    sections: [
      { id: "commitment", h: "Our commitment", body: [
        "We want everyone to be able to order and book with us easily. We aim for this website to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.",
      ] },
      { id: "features", h: "What you can do on this site", body: [{ list: [
        "Use the site with a keyboard; focused items are clearly outlined.",
        "Use the site on phones and tablets, and zoom in using your browser.",
        "Have animations reduced if you've turned on \"reduce motion\" in your device settings.",
        "Read the site in English, Chinese (中文), Vietnamese (Tiếng Việt) or Japanese (日本語).",
        "Use screen readers: buttons and form fields have labels, and status messages (such as \"added to basket\") are announced.",
      ] }] },
      { id: "limits", h: "Known limitations", body: [
        "We haven't had an independent accessibility audit yet. Some photos may lack full descriptions, the location map comes from Google and may be harder to use with assistive technology, and automatic translations may sometimes be imperfect.",
      ] },
      { id: "help", h: "Need help, or found a problem?", body: [
        `You can always order or book by phone on ${f.phone}, and we're happy to read the menu or allergen information to you. To report a problem with the site, email [${f.email}](mailto:${f.email}). Tell us the page and what went wrong, and we'll reply and try to fix it.`,
      ] },
    ],
  };
}

export async function getLegalDoc(slug: LegalSlug): Promise<LegalDoc> {
  const f = await facts();
  switch (slug) {
    case "privacy": return privacy(f);
    case "terms": return terms(f);
    case "cookies": return cookies();
    case "promotions": return promotions(f);
    case "accessibility": return accessibility(f);
  }
}

/** Static titles/summaries (no database), for metadata, the sitemap and links. */
export const LEGAL_META: Record<LegalSlug, { title: string; summary: string }> = {
  privacy: { title: "Privacy Policy", summary: "How we collect, use, share and protect your personal information, and your rights under UK data protection law." },
  terms: { title: "Terms & Conditions", summary: "The terms for ordering delivery or collection, booking a table, and using an account, points or offers." },
  cookies: { title: "Cookie Policy", summary: "The cookies and browser storage this website uses, and how to change your choice." },
  promotions: { title: "Promotion Terms", summary: "Rules for offer codes, first-order discounts, the Fortune Wheel, refer-a-friend and loyalty vouchers." },
  accessibility: { title: "Accessibility Statement", summary: "How we make this website usable for everyone, and how to get help or report a problem." },
};
