import { cn } from "@/lib/utils";
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
  starters: GRADIENTS.gold,
  japanese: GRADIENTS.sakura,
  "salt-pepper": GRADIENTS.bronze,
  soup: GRADIENTS.teal,
  ribs: GRADIENTS.sambal,
  wrapping: GRADIENTS.bronze,
  mains: GRADIENTS.sambal,
  "honey-chilli": GRADIENTS.gold,
  "kung-po": GRADIENTS.sambal,
  "sweet-sour": GRADIENTS.gold,
  "chef-special": GRADIENTS.bronze,
  omelette: GRADIENTS.gold,
  "crispy-noodle": GRADIENTS.jade,
  rice: GRADIENTS.gold,
  "chow-mein": GRADIENTS.jade,
  udon: GRADIENTS.teal,
  combo: GRADIENTS.sambal,
  sides: GRADIENTS.bronze,
  desserts: GRADIENTS.sakura,
  "set-meals": GRADIENTS.gold,
  preorder: GRADIENTS.bronze,
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
}: {
  name: string;
  category: MenuCategory;
  className?: string;
  rounded?: string;
  src?: string;
}) {
  // Real photo when the operator has uploaded one; branded placeholder otherwise.
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", rounded, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} loading="lazy" decoding="async" width={900} height={675} className="size-full object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name} - photo coming soon`}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br text-white",
        CATEGORY_GRADIENT[category],
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
      <span className="font-display text-3xl font-bold tracking-tight drop-shadow-sm select-none">
        {initials(name)}
      </span>
    </div>
  );
}
