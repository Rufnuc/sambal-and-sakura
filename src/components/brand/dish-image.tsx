import { cn } from "@/lib/utils";
import { photoSrcSet } from "@/lib/photo";
import type { MenuCategory } from "@/lib/data/menu";

// Intentional, on-brand placeholder art for dishes (no stock photos available).
// Swap <DishImage> for next/image with real photography at launch.

const GRADIENTS = {
  gold: "from-[#E0A83E] via-[#C98A24] to-[#211D17]",
  sambal: "from-[#C0362C] via-[#8a2a22] to-[#211D17]",
  jade: "from-[#3E7C6A] via-[#2c5a4d] to-[#211D17]",
  bronze: "from-[#8A6D3B] via-[#5f4a28] to-[#15120d]",
  sakura: "from-[#E2869A] via-[#b85f73] to-[#211D17]",
  teal: "from-[#5aa58e] via-[#2c5a4d] to-[#15120d]",
} as const;

const CATEGORY_GRADIENT: Record<MenuCategory, string> = {
  appetiser: GRADIENTS.jade,
  soup: GRADIENTS.teal,
  "salt-pepper": GRADIENTS.bronze,
  tempura: GRADIENTS.gold,
  starters: GRADIENTS.gold,
  skewers: GRADIENTS.bronze,
  bao: GRADIENTS.sakura,
  fish: GRADIENTS.teal,
  seafood: GRADIENTS.teal,
  "king-prawn": GRADIENTS.sambal,
  beef: GRADIENTS.sambal,
  chicken: GRADIENTS.gold,
  vegetables: GRADIENTS.jade,
  rice: GRADIENTS.gold,
  "ho-fun": GRADIENTS.jade,
  vermicelli: GRADIENTS.jade,
  udon: GRADIENTS.teal,
  ramen: GRADIENTS.bronze,
  "sushi-rolls": GRADIENTS.sakura,
  sashimi: GRADIENTS.sakura,
  hosomaki: GRADIENTS.sakura,
  poke: GRADIENTS.teal,
  nigiri: GRADIENTS.sakura,
  platters: GRADIENTS.gold,
  desserts: GRADIENTS.sakura,
  drinks: GRADIENTS.teal,
};

function initials(name: string): string {
  return name
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function DishImage({
  name,
  category,
  className,
  rounded = "rounded-xl",
  src,
  eager = false,
  sizes = "(min-width: 1024px) 400px, (min-width: 640px) 45vw, 50vw",
}: {
  name: string;
  category: MenuCategory;
  className?: string;
  rounded?: string;
  src?: string;
  eager?: boolean; // above-the-fold images (the home banner) load straight away
  sizes?: string;   // how wide the picture is shown, so the browser downloads a matching size (thumbnails pass e.g. "56px")
}) {
  // Real photo when the operator has uploaded one; branded placeholder otherwise.
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", rounded, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} srcSet={photoSrcSet(src)} sizes={sizes} alt={name} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" width={900} height={675} className="size-full object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name} - photo coming soon`}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br text-white",
        CATEGORY_GRADIENT[category] ?? GRADIENTS.gold, // categories the owner added use the house gold
        rounded,
        className,
      )}
    >
      {/* soft grain / glow */}
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(120%_80%_at_20%_10%,rgba(255,255,255,0.35),transparent_55%)]" />
      {/* subtle sakura motif */}
      <svg viewBox="0 0 100 100" className="absolute -right-6 -bottom-6 size-32 opacity-20" aria-hidden="true">
        <g fill="currentColor">
          <path d="M50 20 C56 28 56 40 50 46 C44 40 44 28 50 20 Z" />
          <path d="M50 20 C56 28 56 40 50 46 C44 40 44 28 50 20 Z" transform="rotate(72 50 50)" />
          <path d="M50 20 C56 28 56 40 50 46 C44 40 44 28 50 20 Z" transform="rotate(144 50 50)" />
          <path d="M50 20 C56 28 56 40 50 46 C44 40 44 28 50 20 Z" transform="rotate(216 50 50)" />
          <path d="M50 20 C56 28 56 40 50 46 C44 40 44 28 50 20 Z" transform="rotate(288 50 50)" />
        </g>
      </svg>
      {/* Drawn by CSS from data-initials, not written as text: otherwise "SN", "AC"... become part of the
          page text that Google uses for snippets and AI tools read as content. */}
      <span
        data-initials={initials(name)}
        aria-hidden="true"
        className="font-display text-3xl font-bold tracking-tight drop-shadow-sm select-none before:content-[attr(data-initials)]"
      />
    </div>
  );
}
