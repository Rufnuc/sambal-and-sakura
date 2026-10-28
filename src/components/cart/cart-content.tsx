"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, Tag, Banknote, BadgePercent } from "lucide-react";
import {
  SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DishImage } from "@/components/brand/dish-image";
import { useCart, cartSubtotal } from "@/lib/store/cart";
import { useMenu } from "@/lib/use-menu";
import { deliveryHintText, type DeliveryHint } from "@/lib/order";
import { gbp } from "@/lib/format";
import { track } from "@/lib/analytics";

/** The open basket. Loaded on demand (it carries the menu for suggestions), see cart-sheet.tsx. */
export function CartContent({ onClose }: { onClose: () => void }) {
  const { lines, setQty, removeLine, addLine } = useCart();
  const subtotal = cartSubtotal(lines);
  const [added, setAdded] = useState<string | null>(null);

  const { menu } = useMenu();
  const upsells = menu.filter(
    // Only dishes that need no choices: anything with a required option goes through its own dialog.
    (m) => (m.category === "desserts" || m.category === "drinks") && !m.soldOut && !m.phoneOrder && !lines.some((l) => l.itemId === m.id) &&
      !(m.modifiers ?? []).some((g) => g.required),
  ).slice(0, 3);

  // The free gyoza offer is live only while the owner has Offers switched on (null = no offer).
  const [freeOver, setFreeOver] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<DeliveryHint | null>(null);
  const [online, setOnline] = useState<{ pctOff: number; message: string; appliesTo: "all" | "delivery" | "collection"; minSpend: number } | null>(null);
  useEffect(() => {
    fetch("/api/public-config").then((r) => r.json()).then((d) => {
      setFreeOver(typeof d.freeItemOver === "number" ? d.freeItemOver : null);
      if (d.delivery) setDelivery(d.delivery as DeliveryHint);
      setOnline(d.onlineDiscount ?? null);
    }).catch(() => {});
  }, []);
  const freeGyoza = freeOver !== null && subtotal >= freeOver;

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
                  <DishImage name={l.name} category={(menu.find((m) => m.id === l.itemId)?.category) ?? "mains"} className="size-16 shrink-0" rounded="rounded-lg" />
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
            {freeOver === null ? null : freeGyoza ? (
              <div className="flex items-center gap-2 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
                <Tag className="size-4" /> Free Chicken Gyoza unlocked (not combined with other offer codes)
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Tag className="size-4" /> Spend {gbp(freeOver - subtotal)} more for free Chicken Gyoza
              </div>
            )}
            {online && (
              <div className="flex items-start gap-2 rounded-lg bg-jade/10 px-3 py-2 text-sm text-jade">
                <BadgePercent className="mt-0.5 size-4 shrink-0" />
                <span>
                  {online.message}
                  {online.appliesTo !== "all" ? ` (${online.appliesTo} orders)` : ""}
                  {subtotal < online.minSpend ? ` Spend ${gbp(online.minSpend - subtotal)} more to get it.` : online.appliesTo === "all" ? ` About ${gbp(Math.round(subtotal * online.pctOff) / 100)} off at checkout.` : ""}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-display text-xl font-bold">{gbp(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {delivery && deliveryHintText(delivery) ? `Delivery: ${deliveryHintText(delivery).replace(/^From/, "from")}. ` : ""}Fees & ETA confirmed at checkout.
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
