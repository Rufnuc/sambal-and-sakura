"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, ChefHat, Flame, Leaf, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DishCard } from "@/components/menu/dish-card";
import { type MenuCategory, type MenuCategoryCfg, type DietTag, type MenuItem } from "@/lib/data/menu";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const DIET_FILTERS: { id: DietTag; label: string; icon: React.ElementType }[] = [
  { id: "popular", label: "Popular", icon: Star },
  { id: "chef", label: "Chef's picks", icon: ChefHat },
  { id: "vegetarian", label: "Vegetarian", icon: Leaf },
  { id: "vegan", label: "Vegan", icon: Leaf },
  { id: "spicy", label: "Spicy", icon: Flame },
];

export function MenuBrowser({ menu, categories }: { menu: MenuItem[]; categories: MenuCategoryCfg[] }) {
  // The owner's categories, in their order (Admin -> Menu); empty ones are skipped below.
  const CATEGORIES = categories.map((c) => c.id);
  const labelOf = (id: MenuCategory) => categories.find((c) => c.id === id)?.label ?? id;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<MenuCategory | "all">("all");
  const [diets, setDiets] = useState<Set<DietTag>>(new Set());
  const firedView = useRef(false);

  useEffect(() => {
    if (!firedView.current) {
      track("view_menu");
      firedView.current = true;
    }
  }, []);

  function toggleDiet(d: DietTag) {
    setDiets((s) => {
      const next = new Set(s);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter((m) => {
      if (active !== "all" && m.category !== active) return false;
      if (q && !(`${m.name} ${m.description}`.toLowerCase().includes(q))) return false;
      for (const d of diets) if (!m.tags.includes(d)) return false;
      return true;
    });
  }, [query, active, diets, menu]);

  // Group by category for the "all" view
  const grouped = useMemo(() => {
    const map = new Map<MenuCategory, MenuItem[]>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return map;
  }, [filtered]);

  const hasFilters = query || diets.size > 0 || active !== "all";

  return (
    <div>
      {/* Sticky controls */}
      <div className="sticky top-20 z-30 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes, e.g. duck, katsu, salt & pepper, vegan…"
              className="h-11 pl-9"
              inputMode="search"
              aria-label="Search the menu"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full hover:bg-muted">
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={active === "all"} onClick={() => setActive("all")}>All</Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c} active={active === c} onClick={() => setActive(c)}>
                {labelOf(c)}
              </Chip>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {DIET_FILTERS.map((d) => {
              const on = diets.has(d.id);
              const Icon = d.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => toggleDiet(d.id)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    on ? "border-primary bg-primary/10 text-gold-ink" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-3.5" /> {d.label}
                </button>
              );
            })}
            {hasFilters && (
              <button
                onClick={() => { setQuery(""); setActive("all"); setDiets(new Set()); }}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-sambal hover:underline"
              >
                <X className="size-3.5" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl py-8">
        <p className="mb-6 text-sm text-muted-foreground">
          {filtered.length} dish{filtered.length === 1 ? "" : "es"}
          {active !== "all" ? ` in ${labelOf(active)}` : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
            <Search className="size-8 text-muted-foreground" />
            <p className="font-medium">No dishes match your search.</p>
            <button onClick={() => { setQuery(""); setActive("all"); setDiets(new Set()); }} className="text-sm font-medium text-gold-ink hover:underline">
              Clear filters
            </button>
          </div>
        ) : active === "all" ? (
          <div className="flex flex-col gap-12">
            {CATEGORIES.filter((c) => grouped.has(c)).map((c) => (
              <section key={c} id={c} className="scroll-mt-44">
                <h2 className="mb-5 font-display text-2xl font-bold tracking-tight">{labelOf(c)}</h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {grouped.get(c)!.map((item) => (
                    <DishCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <DishCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition",
        active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
