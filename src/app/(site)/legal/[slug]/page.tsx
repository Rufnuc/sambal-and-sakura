import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Section = { h: string; p: string };
type Doc = { title: string; updated: string; intro: string; sections: Section[] };

const DOCS: Record<string, Doc> = {
  privacy: {
    title: "Privacy Policy",
    updated: "October 2026",
    intro:
      "This placeholder policy explains, in plain terms, how Sambal & Sakura would handle your information. Replace with legally reviewed copy before launch (UK GDPR).",
    sections: [
      { h: "What we collect", p: "Order and booking details you provide (name, phone, delivery address, dietary notes) and basic analytics about how the site is used." },
      { h: "How we use it", p: "To prepare and deliver your order, manage your reservation, send order/booking updates, and improve the service. We never sell your data." },
      { h: "Cookies", p: "We use essential cookies for the site to function and, with consent, anonymous analytics. You can decline non-essential cookies at any time." },
      { h: "Your rights", p: "Under UK GDPR you can request access, correction or deletion of your data. Email hello@sambalandsakura.co.uk and we'll respond within 30 days." },
      { h: "Retention", p: "Order and booking records are kept only as long as needed for operations, accounting and legal obligations, then securely deleted." },
    ],
  },
  terms: {
    title: "Terms & Conditions",
    updated: "October 2026",
    intro: "Placeholder terms covering orders, bookings, payment and cancellations. Replace with reviewed copy before launch.",
    sections: [
      { h: "Ordering", p: "Website orders are cash only, paid on delivery or collection." },
      { h: "Delivery", p: "We deliver within listed postcodes during opening hours. Delivery fees and minimum order values are shown at checkout. ETAs are estimates." },
      { h: "Cancellations & refunds", p: "You may cancel an order before the kitchen begins preparing it. As orders are cash on the day, refunds apply only where we cannot fulfil an order." },
      { h: "Bookings", p: "Reservations can be cancelled free up to 2 hours before. Large parties may require a deposit. Repeated no-shows may affect future bookings." },
      { h: "Vouchers & rewards", p: "Offers, referral rewards and wheel prizes are single-use unless stated, can't be combined unless noted, and have no cash value." },
    ],
  },
  accessibility: {
    title: "Accessibility Statement",
    updated: "October 2026",
    intro: "We want everyone to be able to order and book with ease. This placeholder statement outlines our commitment (target: WCAG 2.2 AA).",
    sections: [
      { h: "Our commitment", p: "We aim to meet WCAG 2.2 AA: sufficient colour contrast, keyboard navigation, visible focus, descriptive labels, and support for reduced motion." },
      { h: "Ongoing work", p: "Accessibility is reviewed as the site evolves. Known issues are prioritised and fixed in regular updates." },
      { h: "Feedback", p: "If you hit a barrier using this site, tell us at hello@sambalandsakura.co.uk or call the restaurant - we'll help and fix the issue." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS[slug];
  return { title: doc ? doc.title : "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm text-muted-foreground">Last updated {doc.updated}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{doc.title}</h1>
      <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">{doc.intro}</p>
      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="font-display text-xl font-bold">{s.h}</h2>
            <p className="mt-1.5 text-muted-foreground text-pretty">{s.p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
