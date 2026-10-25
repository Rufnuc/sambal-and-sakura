import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MenuBrowser } from "@/components/menu/menu-browser";
import { AllergyNotice } from "@/components/menu/allergy-notice";
import { getPublicMenu, getCategories } from "@/server/config";
import { getSiteContent } from "@/server/site-content";
import { RESTAURANT } from "@/lib/data/site";
import { allergensKnown, optionPrices, type MenuItem } from "@/lib/data/menu";
import { formatAddress } from "@/lib/site-content";
import { gbp } from "@/lib/format";
import { fitDescription } from "@/lib/seo";

// One section of the menu on its own short page (e.g. /menu/sushi-rolls): the full menu is long, and
// search engines and AI tools reading a page often stop before the end. Like the full menu it's served
// from a ready-made copy, made on first visit and rebuilt when the menu is saved (or every 5 minutes).
export const revalidate = 300; // at most 5 minutes old even if a save were missed
export function generateStaticParams() {
  return []; // no copies made during the build: each section page is made on its first visit
}

type Params = { params: Promise<{ category: string }> };

async function load(id: string) {
  const [menu, cats, { business }] = await Promise.all([getPublicMenu(), getCategories(), getSiteContent()]);
  const categories = cats.filter((c) => !c.hidden && menu.some((m) => m.category === c.id));
  const category = categories.find((c) => c.id === id);
  return { category, categories, dishes: menu.filter((m) => m.category === id), business };
}

const priced = (m: MenuItem) => (m.phoneOrder && !m.price ? `${m.name} (seasonal price)` : `${m.name} ${optionPrices(m).length ? "from " : ""}${gbp(m.price)}`);

/** "Special Sushi Rolls at Sambal & Sakura, Middlesbrough: Dragon Roll £12.80, ..." - as many dishes as fit in
 *  the ~155 characters search engines show, then "and more". */
function sectionDescription(label: string, city: string, dishes: MenuItem[]): string {
  const start = `${label} at ${RESTAURANT.name}, ${city}: `;
  let list = "";
  for (const m of dishes) {
    const next = list ? `${list}, ${priced(m)}` : priced(m);
    if ((start + next + " and more.").length > 155) break;
    list = next;
  }
  const more = list.split(", ").length < dishes.length ? " and more" : "";
  return fitDescription(`${start}${list || `${dishes.length} dishes`}${more}.`);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const { category: cat, dishes, business } = await load(category);
  if (!cat) return { title: "Menu" };
  return {
    title: `${cat.label} - Menu`,
    description: sectionDescription(cat.label, business.address.city, dishes),
    alternates: { canonical: `/menu/${cat.id}` },
  };
}

export default async function MenuCategoryPage({ params }: Params) {
  const { category } = await params;
  const { category: cat, categories, dishes, business: b } = await load(category);
  if (!cat) notFound();
  return (
    <div className="px-4 sm:px-6">
      <section className="mx-auto max-w-7xl pt-10">
        <Link href="/menu" className="inline-flex items-center gap-1 text-sm font-medium text-gold-ink hover:underline">
          <ArrowLeft className="size-4" /> Full menu
        </Link>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{cat.label}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground text-pretty">
          {dishes.length} dish{dishes.length === 1 ? "" : "es"} at {RESTAURANT.name}, {formatAddress(b.address)}. Order for delivery or collection, or book a table.
        </p>
        <AllergyNotice phone={b.phone} allListed={dishes.every(allergensKnown)} />
      </section>
      <MenuBrowser menu={dishes} categories={categories} pageCategory={cat.id} />
    </div>
  );
}
