"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { useCart, cartCount } from "@/lib/store/cart";
import { useHydrated } from "@/lib/use-hydrated";
import { useBump } from "@/lib/use-bump";
import { cn } from "@/lib/utils";

// The basket's contents (with the menu used for "add a side" suggestions) are downloaded only when
// someone opens it, or starts to (hover/touch), so they're not in every page's JavaScript.
const loadContent = () => import("@/components/cart/cart-content").then((m) => m.CartContent);
const CartContent = dynamic(loadContent, { ssr: false });

export function CartButton({ className }: { className?: string }) {
  const lines = useCart((s) => s.lines);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(lines) : 0;
  const bump = useBump(count, hydrated);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false); // mount the contents once first opened (keeps the closing animation)

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) setOpened(true); }}>
      <SheetTrigger
        className={cn(
          "relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-background transition hover:bg-muted",
          className,
        )}
        onPointerEnter={() => void loadContent()}
        onTouchStart={() => void loadContent()}
        aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
      >
        <ShoppingBag className="size-5" />
        {count > 0 && (
          <span className={cn("absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground", bump && "cart-pop")}>
            {count}
          </span>
        )}
      </SheetTrigger>
      {opened && <CartContent onClose={() => setOpen(false)} />}
    </Sheet>
  );
}

