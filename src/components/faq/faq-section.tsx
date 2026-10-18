import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getLiveSiteContent } from "@/server/live-content";
import { FaqJsonLd } from "@/components/seo/structured-data";

const GROUPS: { id: string; label: string }[] = [
  { id: "ordering", label: "Ordering" },
  { id: "delivery", label: "Delivery" },
  { id: "booking", label: "Booking" },
  { id: "payment", label: "Payment" },
  { id: "allergens", label: "Allergens & diets" },
  { id: "policies", label: "Policies" },
];

/** The restaurant's FAQ (edited in Admin -> Site content), grouped by topic. Lives on the Contact page. */
export async function FaqSection() {
  const { faqs } = await getLiveSiteContent();
  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="mt-16 scroll-mt-24">
      <FaqJsonLd />
      <header className="max-w-2xl">
        <p className="font-medium uppercase tracking-widest text-gold-ink">Good to know</p>
        <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Frequently asked questions</h2>
        <p className="mt-3 text-muted-foreground">Can&apos;t find your answer? Send us a message above and we&apos;ll help.</p>
      </header>

      <div className="mt-8 flex max-w-3xl flex-col gap-10">
        {GROUPS.map((g) => {
          const items = faqs.filter((f) => f.group === g.id);
          if (items.length === 0) return null;
          return (
            <div key={g.id}>
              <h3 className="mb-3 font-display text-xl font-bold">{g.label}</h3>
              <Accordion className="rounded-2xl border border-border bg-card px-4">
                {items.map((f, i) => (
                  <AccordionItem key={i} value={`${g.id}-${i}`} className="border-border last:border-0">
                    <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
                    <AccordionContent keepMounted className="text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          );
        })}
      </div>
    </section>
  );
}
