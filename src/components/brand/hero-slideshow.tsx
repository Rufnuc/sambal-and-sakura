"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Cross-fading hero background. Pass `images` (URLs) to use real photography;
// otherwise it cycles through on-brand gradient scenes. A dark overlay keeps
// the hero text legible in both cases.
const GRADIENT_SCENES = [
  "bg-[radial-gradient(120%_120%_at_20%_10%,#C0362C_0%,#2a140f_45%,#120f0b_100%)]",
  "bg-[radial-gradient(120%_120%_at_80%_20%,#D99A2B_0%,#3a2a12_45%,#120f0b_100%)]",
  "bg-[radial-gradient(120%_120%_at_30%_80%,#3E7C6A_0%,#15241f_45%,#120f0b_100%)]",
  "bg-[radial-gradient(120%_120%_at_70%_70%,#E2869A_0%,#2e1a20_45%,#120f0b_100%)]",
];

export function HeroSlideshow({ images }: { images?: string[] }) {
  const scenes = images && images.length ? images : GRADIENT_SCENES;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (scenes.length < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % scenes.length), 5500);
    return () => clearInterval(id);
  }, [scenes.length]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {scenes.map((s, idx) => (
        <div
          key={idx}
          className={cn(
            "absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out",
            !images && s,
          )}
          style={images ? { backgroundImage: `url(${s})`, opacity: idx === i ? 1 : 0 } : { opacity: idx === i ? 1 : 0 }}
        />
      ))}
      {/* legibility overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-sidebar/95 via-sidebar/80 to-sidebar/40" />
      <div className="absolute inset-0 bg-sidebar/30" />
    </div>
  );
}
