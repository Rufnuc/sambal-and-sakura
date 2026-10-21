import type { Metadata } from "next";
import { getLiveSiteContent } from "@/server/live-content";
import Link from "next/link";
import {
  ArrowRight, Banknote, Bike, Sparkles, Star, Phone, MapPin, Clock, ChefHat, Leaf, Gift, ShieldCheck, Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DishCard } from "@/components/menu/dish-card";
import { DishImage } from "@/components/brand/dish-image";
import { Reveal } from "@/components/brand/reveal";
import { OpenStatus } from "@/components/brand/open-status";
import type { MenuItem } from "@/lib/data/menu";
import { getPublicMenu } from "@/server/config";
import { telHref, averageRating, type SiteContent, type ValueIcon } from "@/lib/site-content";
import { formatHours } from "@/lib/hours";
import { RestaurantJsonLd, WebSiteJsonLd } from "@/components/seo/structured-data";
import { MapEmbed } from "@/components/brand/map-embed";
import { HeroSlideshow } from "@/components/brand/hero-slideshow";
import { realPhoto } from "@/lib/photo";
import { RESTAURANT } from "@/lib/data/site";


export const metadata: Metadata = { alternates: { canonical: "/" } };

// Rendered on every request: this page shows admin-editable content, so it must NOT be frozen at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [menu, content] = await Promise.all([getPublicMenu(), getLiveSiteContent()]);
  // The owner's picks (Admin → Site content → Home page), else chef's specials and popular dishes.
  const picked = content.signature.dishIds.map((id) => menu.find((m) => m.id === id)).filter((m): m is MenuItem => !!m);
  const signature = picked.length ? picked : menu.filter((m) => m.tags.includes("chef") || m.tags.includes("popular")).slice(0, 6);
  return (
    <>
      <RestaurantJsonLd />
      <WebSiteJsonLd />
      <Hero content={content} menu={menu} />
      <ValueStrip items={content.valueStrip} />
      <SignatureDishes items={signature} />
      <Reviews reviews={content.reviews} />
      <VisitUs content={content} />
      <FinalCta cta={content.cta} />
    </>
  );
}

/* ----------------------------------------------------------------- Hero */
// The three stacked plates (sizes are fractions of the square, so they scale with the column).
const PLATES = [
  "left-0 top-[5%] w-[57%] rotate-[-6deg]",
  "right-0 top-0 w-[50%] rotate-[5deg]",
  "bottom-0 right-[9%] w-[46%] rotate-[-3deg]",
];

// Saving trims the space off the end of each headline part ("Where chili meets " -> "...meets"), which
// ran the words together ("meetscherry"). Put it back between words, but not before punctuation.
function gap(before: string, after: string): string {
  return before && after && !/\s$/.test(before) && !/^[\s.,!?;:)]/.test(after) ? " " : "";
}

function Hero({ content, menu }: { content: SiteContent; menu: MenuItem[] }) {
  const { business: b, hero, reviews } = content;
  const plates = hero.images.slice(0, 3).map((img) => {
    const dish = menu.find((m) => m.id === img.dishId);
    return dish ? { name: dish.name, category: dish.category, src: img.photo || realPhoto(dish.image) } : null;
  });
  const featured = hero.featured >= 0 ? plates[hero.featured] : null;
  const showRating = reviews.show && reviews.items.length > 0;
  return (
    <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
      <HeroSlideshow />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:py-24">
        <div className="max-w-xl">
          <Badge variant="outline" className="border-gold/40 bg-gold/10 text-gold-ink">
            <Sparkles className="size-3.5" /> {hero.badge}
          </Badge>
          {/* The page's one heading says plainly who and what this is (search engines and AI tools read it
              first), with the tagline as the big display line. */}
          <h1 className="mt-5">
            <span className="block font-sans text-sm font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/70">
              {RESTAURANT.name} · Chinese &amp; Japanese restaurant in {b.address.city}
            </span>
            <span className="mt-3 block font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-balance sm:text-6xl md:text-5xl lg:text-7xl">
              {hero.headlineStart}{gap(hero.headlineStart, hero.headlineAccent)}<span className="text-gold-ink">{hero.headlineAccent}</span>{gap(hero.headlineAccent, hero.headlineEnd)}{hero.headlineEnd}
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-sidebar-foreground/75 text-pretty">
            {b.blurb}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="h-13 px-7 text-base font-semibold">
              <Link href="/order">Order Now <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild variant="outline" className="h-13 border-sidebar-border bg-transparent px-7 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <Link href="/book">Book a Table</Link>
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-sidebar-foreground/70">
            <OpenStatus />
            <a href={telHref(b.phone)} className="inline-flex items-center gap-1.5 hover:text-gold-ink">
              <Phone className="size-4" /> {b.phone}
            </a>
            {showRating && (
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-4 fill-gold text-gold" /> {averageRating(reviews.items)} · {reviews.items.length}+ reviews
              </span>
            )}
          </div>
        </div>

        {/* Visual: layered plates + a name card, chosen in Admin → Site content → Home page. Only shown where
            it fits beside the text (tablets and up); phones get the text alone. */}
        <div className="relative mx-auto hidden aspect-square w-full max-w-md md:block">
          {plates.map((p, i) => p && (
            <DishImage key={i} name={p.name} category={p.category} src={p.src} eager className={`absolute aspect-square shadow-2xl ring-4 ring-sidebar ${PLATES[i]}`} rounded="rounded-3xl" />
          ))}
          {featured && (
            <div className="absolute bottom-[9%] left-0 max-w-[60%] rounded-2xl bg-background px-3 py-2 text-foreground shadow-xl sm:px-4 sm:py-3">
              <p className="text-xs text-muted-foreground">Signature</p>
              <p className="font-display text-base font-bold leading-tight sm:text-lg">{featured.name}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Value strip */
const VALUE_ICON_MAP: Record<ValueIcon, React.ElementType> = {
  banknote: Banknote, bike: Bike, sparkles: Sparkles, chef: ChefHat, leaf: Leaf,
  clock: Clock, star: Star, gift: Gift, shield: ShieldCheck, heart: Heart,
};

function ValueStrip({ items }: { items: SiteContent["valueStrip"] }) {
  if (!items.length) return null;
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-px overflow-hidden px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {items.map((it, idx) => {
          const Icon = VALUE_ICON_MAP[it.icon] ?? Sparkles;
          return (
          <div key={idx} className="flex items-start gap-3 px-2 py-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-gold-ink">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="font-semibold">{it.title}</p>
              <p className="text-sm text-muted-foreground">{it.text}</p>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Signature dishes */
function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="font-medium uppercase tracking-widest text-gold-ink">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SignatureDishes({ items }: { items: MenuItem[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <SectionHeading
        eyebrow="Straight from the wok"
        title="Signature dishes"
        action={
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/menu">Full menu <ArrowRight className="size-4" /></Link>
          </Button>
        }
      />
      {/* Two per row on phones (compact cards), then 2 / 3 columns on larger screens. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
        {items.map((item, i) => (
          <Reveal key={item.id} delay={i * 60} className="h-full">
            <DishCard item={item} dense className="h-full" />
          </Reveal>
        ))}
      </div>
      <div className="mt-8 sm:hidden">
        <Button asChild className="h-12 w-full">
          <Link href="/menu">See the full menu</Link>
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Reviews */
function Reviews({ reviews }: { reviews: SiteContent["reviews"] }) {
  if (!reviews.show || reviews.items.length === 0) return null;
  const avgRating = averageRating(reviews.items);
  return (
    <section id="reviews" className="scroll-mt-20 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionHeading eyebrow="Loved locally" title="What guests are saying" />
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="size-5 fill-gold text-gold" />
            ))}
          </div>
          <p className="text-lg font-semibold">{avgRating} out of 5</p>
          {reviews.sourceNote && <p className="text-muted-foreground">· {reviews.sourceNote}</p>}
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews.items.slice(0, 6).map((t, i) => (
            <Reveal key={t.id} delay={i * 50}>
              <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="size-4 fill-gold text-gold" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-pretty">&ldquo;{t.text}&rdquo;</blockquote>
                <figcaption className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-muted-foreground">{t.dish ? t.dish : t.source}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Visit us */
function VisitUs({ content }: { content: SiteContent }) {
  const b = content.business;
  const street = b.address.line1.replace(/^[\d\s\u2013-]+/, "") || b.address.city;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <SectionHeading eyebrow="Come say hello" title={`Find us on ${street}`} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-border">
          <MapEmbed query={b.mapQuery} title="Map to Sambal and Sakura" className="h-80 lg:h-full" />
        </div>
        <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-7">
          <OpenStatus />
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 text-gold-ink" />
            <p>{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}<br />{b.address.city} {b.address.postcode}</p>
          </div>
          <a href={telHref(b.phone)} className="flex items-center gap-3 hover:text-gold-ink">
            <Phone className="size-5 text-gold-ink" /> {b.phone}
          </a>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-5 text-gold-ink" />
            <ul className="w-full space-y-1 text-sm">
              {b.hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{h.day}</span>
                  <span className="text-right">{formatHours(h)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-1 flex gap-2">
            <Button asChild className="h-11 flex-1 font-semibold"><Link href="/order">Order Now</Link></Button>
            <Button asChild variant="secondary" className="h-11 flex-1"><Link href="/book">Book a Table</Link></Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Final CTA */
function FinalCta({ cta }: { cta: SiteContent["cta"] }) {
  return (
    <section className="bg-sidebar text-sidebar-foreground">
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {cta.heading}
        </h2>
        {cta.subtext && (
          <p className="mx-auto mt-4 max-w-xl text-sidebar-foreground/75">{cta.subtext}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="h-13 px-8 text-base font-semibold"><Link href="/order">Order Now <ArrowRight className="size-4" /></Link></Button>
          <Button asChild variant="outline" className="h-13 border-sidebar-border bg-transparent px-8 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><Link href="/book">Book a Table</Link></Button>
        </div>
      </div>
    </section>
  );
}
