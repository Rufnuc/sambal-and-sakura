import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FaqJsonLd } from "@/components/seo/structured-data";
import { getSiteContent } from "@/server/site-content";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers on ordering, delivery, booking, payment, allergens and cancellations.",
};

const GROUPS: { id: string; label: string }[] = [
  { id: "ordering", label: "Ordering" },
  { id: "delivery", label: "Delivery" },
  { id: "booking", label: "Booking" },
  { id: "payment", label: "Payment" },
  { id: "allergens", label: "Allergens & diets" },
  { id: "policies", label: "Policies" },
];

export default async function FaqPage() {
  const { faqs } = await getSiteContent();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <FaqJsonLd />
      <header>
        <p className="font-medium uppercase tracking-widest text-gold">Good to know</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Frequently asked questions</h1>
        <p className="mt-3 text-muted-foreground">
          Still stuck? <Link href="/contact" className="font-medium text-primary hover:underline">Contact us</Link> and we'll help.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        {GROUPS.map((g) => {
          const items = faqs.filter((f) => f.group === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id}>
              <h2 className="mb-3 font-display text-xl font-bold">{g.label}</h2>
              <Accordion className="rounded-2xl border border-border bg-card px-4">
                {items.map((f, i) => (
                  <AccordionItem key={i} value={`${g.id}-${i}`} className="border-border last:border-0">
                    <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          );
        })}
      </div>

      <div className="mt-12 flex flex-wrap gap-3 rounded-2xl border border-border bg-muted/40 p-6">
        <div className="flex-1">
          <p className="font-display text-lg font-bold">Ready to order?</p>
          <p className="text-sm text-muted-foreground">Direct prices, cash on the day, rewards on every order.</p>
        </div>
        <Button asChild className="h-11 font-semibold"><Link href="/order">Order Now</Link></Button>
        <Button asChild variant="secondary" className="h-11"><Link href="/book">Book a Table</Link></Button>
      </div>
    </div>
  );
}
