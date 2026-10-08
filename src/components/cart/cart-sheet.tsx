"use client";

import Link from "next/link";
import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, Tag, Banknote } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DishImage } from "@/components/brand/dish-image";
import { useCart, cartCount, cartSubtotal } from "@/lib/store/cart";
import { MENU } from "@/lib/data/menu";
import { ORDERING } from "@/lib/data/site";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export function CartButton({ className }: { className?: string }) {
  const lines = useCart((s) => s.lines);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(lines) : 0;
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          "relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-background transition hover:bg-muted",
          className,
        )}
        aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
      >
        <ShoppingBag className="size-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
            {count}
          </span>
        )}
      </SheetTrigger>
      <CartContent onClose={() => setOpen(false)} />
    </Sheet>
  );
}

function CartContent({ onClose }: { onClose: () => void }) {
  const { lines, setQty, removeLine, addLine } = useCart();
  const subtotal = cartSubtotal(lines);
  const [added, setAdded] = useState<string | null>(null);

  const upsells = MENU.filter(
    (m) => (m.category === "desserts" || m.category === "sides") && !m.soldOut && !lines.some((l) => l.itemId === m.id),
  ).slice(0, 3);

  const GYOZA_THRESHOLD = 25;
  const freeGyoza = subtotal >= GYOZA_THRESHOLD;

  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="font-display text-xl">Your order</SheetTitle>
        <SheetDescription className="flex items-center gap-1.5 text-xs">
          <Banknote className="size-3.5 text-jade" /> Cash only · pay on delivery or collection
        </SheetDescription>
      </SheetHeader>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <ShoppingBag className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">Your basket is empty.</p>
          <Button asChild variant="default" className="h-11 px-6">
            <Link href="/menu" onClick={onClose}>Browse the menu</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="flex flex-col gap-4">
              {lines.map((l) => (
                <li key={l.lineId} className="flex gap-3">
                  <DishImage name={l.name} category={(MENU.find((m) => m.id === l.itemId)?.category) ?? "mains"} className="size-16 shrink-0" rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{l.name}</p>
                      <span className="shrink-0 font-semibold">{gbp(l.unitPrice * l.qty)}</span>
                    </div>
                    {l.modifiers.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {l.modifiers.map((m) => m.label).join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button
                          aria-label="Decrease quantity"
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                          onClick={() => setQty(l.lineId, l.qty - 1)}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                        <button
                          aria-label="Increase quantity"
                          className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                          onClick={() => setQty(l.lineId, l.qty + 1)}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <button
                        aria-label={`Remove ${l.name}`}
                        className="ml-auto flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeLine(l.lineId)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {upsells.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-semibold">Add a little extra</p>
                <div className="flex flex-col gap-2">
                  {upsells.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                      <DishImage name={u.name} category={u.category} className="size-10 shrink-0" rounded="rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{gbp(u.price)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          addLine(u, u.price, []);
                          track("add_to_cart", { id: u.id, source: "upsell" });
                          setAdded(u.id);
                          setTimeout(() => setAdded(null), 1200);
                        }}
                      >
                        {added === u.id ? "Added" : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="gap-3 border-t border-border px-5 py-4">
            {freeGyoza ? (
              <div className="flex items-center gap-2 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
                <Tag className="size-4" /> Free Chicken Gyoza unlocked on this order!
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Tag className="size-4" /> Spend {gbp(GYOZA_THRESHOLD - subtotal)} more for free Chicken Gyoza
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-display text-xl font-bold">{gbp(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Delivery from {gbp(ORDERING.deliveryZones[0].fee)} · free over {gbp(ORDERING.freeDeliveryThreshold)}. Fees & ETA confirmed at checkout.
            </p>
            <Separator />
            <Button asChild className="h-12 text-base font-semibold">
              <Link href="/order" onClick={() => { track("begin_checkout", { subtotal }); onClose(); }}>
                Go to checkout · {gbp(subtotal)}
              </Link>
            </Button>
          </SheetFooter>
        </>
      )}
    </SheetContent>
  );
}
