"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, Flame, Leaf, Star, ChefHat, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DishImage } from "@/components/brand/dish-image";
import { DishAssistant } from "@/components/menu/dish-assistant";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useCart, type CartLine } from "@/lib/store/cart";
import type { MenuItem } from "@/lib/data/menu";
import { cn } from "@/lib/utils";

const TAG_META: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  popular: { label: "Popular", icon: Star, className: "bg-gold/15 text-gold-ink border-gold/30" },
  chef: { label: "Chef's pick", icon: ChefHat, className: "bg-jade/15 text-jade border-jade/30" },
  spicy: { label: "Spicy", icon: Flame, className: "bg-sambal/15 text-sambal border-sambal/30" },
  vegetarian: { label: "Veg", icon: Leaf, className: "bg-jade/15 text-jade border-jade/30" },
  vegan: { label: "Vegan", icon: Leaf, className: "bg-jade/15 text-jade border-jade/30" },
  new: { label: "New", icon: Sparkles, className: "bg-sakura/20 text-sambal dark:text-sakura border-sakura/40" },
};

// Base menu data carries placeholder paths (/menu/*.jpg) that don't exist yet.
// Only operator-uploaded (/uploads/) or remote (http) images are rendered as real photos.
export function realPhoto(src?: string): string | undefined {
  if (!src) return undefined;
  return src.startsWith("/uploads/") || src.startsWith("http") ? src : undefined;
}

function SpiceDots({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Spice level ${level} of 3`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame key={i} className={cn("size-3.5", i < level ? "text-sambal" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

// dense: compact styling below the `sm` breakpoint so two cards fit per row on phones.
// Tablet/desktop look is unchanged.
export function DishCard({ item, className, dense = false }: { item: MenuItem; className?: string; dense?: boolean }) {
  const addLine = useCart((s) => s.addLine);

  // Adding to the cart must never block the screen: no popup. Instead the button briefly reads
  // "Added" and the cart badge pops (see useBump). Screen readers get a polite announcement.
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flash() {
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 1100);
  }
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  function quickAdd() {
    addLine(item, item.price, []);
    track("add_to_cart", { id: item.id, source: "quick" });
    flash();
  }

  const tags = item.tags.filter((t) => TAG_META[t]).slice(0, 2);
  const photo = realPhoto(item.image);

  return (
    <div className={cn("group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md", className)}>
      <div className="relative">
        <DishImage name={item.name} category={item.category} className={cn("w-full", dense ? "aspect-square sm:aspect-[4/3]" : "aspect-[4/3]")} rounded="rounded-none" src={photo} />
        {item.leadTimeHours ? (
          <div className={cn("absolute rounded-full bg-background/90 font-semibold text-gold-ink backdrop-blur", dense ? "bottom-2 left-2 px-2 py-0.5 text-[10px] sm:bottom-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-xs" : "bottom-3 left-3 px-2.5 py-1 text-xs")}>
            Pre-order · {item.leadTimeHours}h notice
          </div>
        ) : null}
        <div className={cn("absolute flex flex-wrap gap-1.5", dense ? "left-2 top-2 sm:left-3 sm:top-3" : "left-3 top-3")}>
          {(dense ? tags.slice(0, 1) : tags).map((t, idx) => {
            const m = TAG_META[t];
            const Icon = m.icon;
            return (
              <Badge key={t} variant="outline" className={cn("gap-1 border bg-background/90 backdrop-blur", dense && "px-1.5 text-[10px] sm:px-2 sm:text-xs", dense && idx > 0 && "hidden sm:inline-flex", m.className)}>
                <Icon className="size-3" /> {m.label}
              </Badge>
            );
          })}
        </div>
        {item.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <span className={cn("rounded-full bg-foreground font-semibold text-background", dense ? "px-3 py-1 text-xs sm:px-4 sm:py-1.5 sm:text-sm" : "px-4 py-1.5 text-sm")}>Sold out today</span>
          </div>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col", dense ? "p-3 sm:p-4" : "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn("font-display font-bold leading-tight", dense ? "text-sm sm:text-lg" : "text-lg")}>{item.name}</h3>
          <SpiceDots level={item.spiceLevel} />
        </div>
        <p className={cn("mt-1 line-clamp-2 text-muted-foreground", dense ? "text-xs sm:text-sm" : "text-sm")}>{item.description}</p>

        {item.allergens.length > 0 && (
          <p className={cn("mt-2 text-xs text-muted-foreground", dense && "hidden sm:block")}>
            Allergens: {item.allergens.join(", ")}
          </p>
        )}

        <div className={cn("mt-3", dense && "mt-2 sm:mt-3")}>
          <DishAssistant item={item} compact={dense} />
        </div>

        <div className={cn("mt-auto flex items-center justify-between gap-2", dense ? "pt-3 sm:pt-4" : "pt-4")}>
          <div className="flex items-baseline gap-2">
            <span className={cn("font-display font-bold", dense ? "text-base sm:text-xl" : "text-xl")}>{gbp(item.price)}</span>
          </div>
          {item.modifiers && item.modifiers.length > 0 ? (
            <CustomiseDialog item={item} dense={dense} onAdded={flash} />
          ) : (
            <Button size="sm" className={cn("gap-1", dense ? "h-8 px-2.5 sm:h-9 sm:px-3" : "h-9")} disabled={item.soldOut} onClick={quickAdd}>
              {justAdded ? <Check className="size-4" /> : <Plus className="size-4" />} {justAdded ? "Added" : "Add"}
            </Button>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{justAdded ? `${item.name} added to cart` : ""}</span>
    </div>
  );
}

function CustomiseDialog({ item, dense = false, onAdded }: { item: MenuItem; dense?: boolean; onAdded?: () => void }) {
  const addLine = useCart((s) => s.addLine);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [single, setSingle] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    item.modifiers?.forEach((g) => {
      if (g.type === "single" && g.required) init[g.id] = g.options[0].id;
    });
    return init;
  });
  const [multi, setMulti] = useState<Record<string, Set<string>>>({});

  const { unitPrice, selected } = useMemo(() => {
    let price = item.price;
    const sel: CartLine["modifiers"] = [];
    item.modifiers?.forEach((g) => {
      if (g.type === "single") {
        const optId = single[g.id];
        const opt = g.options.find((o) => o.id === optId);
        if (opt) { price += opt.priceDelta; sel.push({ groupId: g.id, optionId: opt.id, label: opt.label }); }
      } else {
        (multi[g.id] ?? new Set()).forEach((optId) => {
          const opt = g.options.find((o) => o.id === optId);
          if (opt) { price += opt.priceDelta; sel.push({ groupId: g.id, optionId: opt.id, label: opt.label }); }
        });
      }
    });
    return { unitPrice: price, selected: sel };
  }, [item, single, multi]);

  function confirm() {
    addLine(item, unitPrice, selected, qty);
    track("add_to_cart", { id: item.id, source: "customise", qty });
    onAdded?.();
    setOpen(false);
    setQty(1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn("inline-flex items-center gap-1 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/80 disabled:opacity-50", dense ? "h-8 px-2.5 sm:h-9 sm:px-3" : "h-9 px-3")}
        disabled={item.soldOut}
      >
        <Plus className="size-4" /> {dense ? (<><span className="sm:hidden">Options</span><span className="hidden sm:inline">Customise</span></>) : "Customise"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{item.name}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {item.modifiers?.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{g.label}</p>
                {g.required && <span className="text-xs text-muted-foreground">Required</span>}
              </div>
              {g.type === "single" ? (
                <RadioGroup
                  value={single[g.id]}
                  onValueChange={(v) => setSingle((s) => ({ ...s, [g.id]: v }))}
                  className="grid gap-2"
                >
                  {g.options.map((o) => (
                    <Label key={o.id} htmlFor={`${g.id}-${o.id}`} className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <span className="flex items-center gap-2">
                        <RadioGroupItem id={`${g.id}-${o.id}`} value={o.id} />
                        {o.label}
                      </span>
                      {o.priceDelta > 0 && <span className="text-sm text-muted-foreground">+{gbp(o.priceDelta)}</span>}
                    </Label>
                  ))}
                </RadioGroup>
              ) : (
                <div className="grid gap-2">
                  {g.options.map((o) => {
                    const set = multi[g.id] ?? new Set<string>();
                    const checked = set.has(o.id);
                    return (
                      <Label key={o.id} htmlFor={`${g.id}-${o.id}`} className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                        <span className="flex items-center gap-2">
                          <Checkbox
                            id={`${g.id}-${o.id}`}
                            checked={checked}
                            onCheckedChange={(c) =>
                              setMulti((m) => {
                                const next = new Set(m[g.id] ?? []);
                                if (c) next.add(o.id); else next.delete(o.id);
                                return { ...m, [g.id]: next };
                              })
                            }
                          />
                          {o.label}
                        </span>
                        {o.priceDelta > 0 && <span className="text-sm text-muted-foreground">+{gbp(o.priceDelta)}</span>}
                      </Label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center rounded-full border border-border">
            <button aria-label="Decrease quantity" className="flex size-10 items-center justify-center rounded-full hover:bg-muted" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="w-8 text-center tabular-nums">{qty}</span>
            <button aria-label="Increase quantity" className="flex size-10 items-center justify-center rounded-full hover:bg-muted" onClick={() => setQty((q) => q + 1)}>+</button>
          </div>
          <Button className="h-12 flex-1 text-base font-semibold" onClick={confirm}>
            Add to order · {gbp(unitPrice * qty)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
