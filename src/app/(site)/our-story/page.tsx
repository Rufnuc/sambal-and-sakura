import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSiteContent } from "@/server/site-content";
import { storyParagraphs, formatAddress } from "@/lib/site-content";
import { RESTAURANT } from "@/lib/data/site";
import { fitDescription } from "@/lib/seo";

// The owner's "Our story" (Admin -> Site content -> Our story). While it's switched off this page doesn't exist.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { story } = await getSiteContent();
  if (!story.show) return { title: "Our story", robots: { index: false, follow: false } };
  return { title: story.heading, description: fitDescription(storyParagraphs(story.body)[0] ?? RESTAURANT.blurb), alternates: { canonical: "/our-story" } };
}

export default async function OurStoryPage() {
  const { story, business: b } = await getSiteContent();
  if (!story.show) notFound();
  const paragraphs = storyParagraphs(story.body);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="font-medium uppercase tracking-widest text-gold-ink">About us</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{story.heading}</h1>
      {story.photo && (
        // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo or the owner's own link
        <img src={story.photo} alt={`${RESTAURANT.name}, ${b.address.city}`} className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
      )}
      <div className="mt-8 flex flex-col gap-5 text-lg leading-relaxed text-pretty">
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <p className="mt-10 text-sm text-muted-foreground">{RESTAURANT.name} · {formatAddress(b.address)} · {b.phone}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild className="h-12 px-6"><Link href="/menu">See the menu</Link></Button>
        <Button asChild variant="outline" className="h-12 px-6"><Link href="/book">Book a table</Link></Button>
      </div>
    </article>
  );
}
