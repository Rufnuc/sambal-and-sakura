"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, CalendarCheck, Ticket, User } from "lucide-react";
import { useCart, cartCount } from "@/lib/store/cart";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export function MobileCtaBar() {
  const pathname = usePathname();
  const lines = useCart((s) => s.lines);
  const hydrated = useHydrated();
  const count = hydrated ? cartCount(lines) : 0;

  // Hide inside the admin area
  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4">
        <CtaItem href="/offers" label="Offers" active={pathname === "/offers"}>
          <Ticket className="size-5" />
        </CtaItem>
        <CtaItem href="/account" label="Account" active={pathname === "/account"}>
          <User className="size-5" />
        </CtaItem>
        <CtaItem href="/book" label="Book" active={pathname === "/book"}>
          <CalendarCheck className="size-5" />
        </CtaItem>
        <CtaItem href="/order" label="Order" active={pathname === "/order"} highlight>
          <span className="relative">
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </span>
        </CtaItem>
      </div>
    </div>
  );
}

function CtaItem({
  href, label, children, active, highlight,
}: {
  href: string; label: string; children: React.ReactNode; active?: boolean; highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition",
        highlight ? "text-primary" : active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}
