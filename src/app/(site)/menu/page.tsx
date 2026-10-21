import type { Metadata } from "next";
import { Banknote, Leaf, Flame } from "lucide-react";
import { MenuBrowser } from "@/components/menu/menu-browser";
import { MenuJsonLd } from "@/components/seo/structured-data";
import { Ticket } from "lucide-react";
import { getPublicMenu, getDeal, getCategories } from "@/server/config";
import { gbp } from "@/lib/format";
import { getSiteContent } from "@/server/site-content";
import { telHref } from "@/lib/site-content";
import { allergensKnown } from "@/lib/data/menu";

// Rendered on every request: this page shows admin-editable content, so it must NOT be frozen at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/menu" },
  title: "Menu",
  description: "Our full menu with prices: salt & pepper, tempura, aromatic crispy duck, sushi and sashimi, ramen, nasi lemak, rendang and more.",
};

export default async function MenuPage() {
  const [menu, deal, { business: b }, allCats] = await Promise.all([getPublicMenu(), getDeal(), getSiteContent(), getCategories()]);
  const categories = allCats.filter((c) => !c.hidden);
  return (
    <div className="px-4 sm:px-6">
      <MenuJsonLd menu={menu} categories={categories} />
      <section className="mx-auto max-w-7xl pt-10">
        <p className="font-medium uppercase tracking-widest text-gold-ink">The menu</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Everything, made to order
        </h1>
        {/* Only claimed once true: allergens are entered per dish by the kitchen (Admin -> Menu). */}
        {menu.every(allergensKnown) && (
          <p className="mt-3 max-w-2xl text-muted-foreground text-pretty">
            Allergens and diet tags are listed on every dish.
          </p>
        )}
        <p className="mt-2 max-w-2xl text-sm text-sambal">
          Food allergy or intolerance? Please phone us on{" "}
          <a href={telHref(b.phone)} className="font-medium underline">{b.phone}</a> to confirm before ordering.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-jade/10 px-3 py-1 text-jade"><Banknote className="size-4" /> Cash only</span>
          {menu.some((m) => m.tags.includes("vegetarian") || m.tags.includes("vegan")) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-jade/10 px-3 py-1 text-jade"><Leaf className="size-4" /> Veg & vegan options</span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sambal/10 px-3 py-1 text-sambal"><Flame className="size-4" /> Spice levels to order</span>
        </div>
      </section>

      {deal.active && deal.title && (
        <div className="mx-auto mt-6 max-w-7xl">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/15 to-background p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold-ink"><Ticket className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-ink">{deal.badge}</p>
              <p className="font-display text-xl font-bold">{deal.title}</p>
              {deal.description && <p className="text-sm text-muted-foreground">{deal.description}</p>}
            </div>
            {typeof deal.price === "number" && <span className="font-display text-2xl font-extrabold text-gold-ink">{gbp(deal.price)}</span>}
          </div>
        </div>
      )}

      <MenuBrowser menu={menu} categories={categories} />
    </div>
  );
}
