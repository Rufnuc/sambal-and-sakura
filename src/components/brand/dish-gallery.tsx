"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DishImage } from "@/components/brand/dish-image";
import type { MenuCategory } from "@/lib/data/menu";
import { cn } from "@/lib/utils";

/**
 * A dish's photos. One photo (or none) renders exactly like DishImage. Several become a swipeable strip
 * (native scroll-snap, so it's smooth on phones and needs no library), with dots and, on larger
 * screens, arrows.
 */
export function DishGallery({ name, category, photos, className, rounded = "rounded-xl" }: {
  name: string; category: MenuCategory; photos: string[]; className?: string; rounded?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (photos.length < 2) return <DishImage name={name} category={category} src={photos[0]} className={className} rounded={rounded} />;

  const go = (i: number) => {
    const el = strip.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={cn("group/gallery relative overflow-hidden bg-muted", rounded, className)} role="group" aria-roledescription="carousel" aria-label={`${name} photos`}>
      <div
        ref={strip}
        className="flex size-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
      >
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src} src={src} alt={`${name} - photo ${i + 1} of ${photos.length}`}
            loading="lazy" decoding="async" width={900} height={675} draggable={false}
            className="size-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)} disabled={index === 0}
        className="absolute left-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow transition disabled:opacity-0 sm:flex sm:opacity-0 sm:group-hover/gallery:opacity-100 sm:focus-visible:opacity-100">
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" aria-label="Next photo" onClick={() => go(index + 1)} disabled={index === photos.length - 1}
        className="absolute right-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow transition disabled:opacity-0 sm:flex sm:opacity-0 sm:group-hover/gallery:opacity-100 sm:focus-visible:opacity-100">
        <ChevronRight className="size-4" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
        {photos.map((_, i) => (
          <span key={i} className={cn("size-1.5 rounded-full shadow transition", i === index ? "bg-white" : "bg-white/50")} />
        ))}
      </div>
    </div>
  );
}
