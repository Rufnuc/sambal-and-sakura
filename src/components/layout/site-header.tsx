"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/logo";
import { OpenStatus } from "@/components/brand/open-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { CartButton } from "@/components/cart/cart-sheet";
import { AccountButton } from "@/components/account/account-button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { PRIMARY_NAV, MORE_NAV } from "@/lib/nav";
import { telHref } from "@/lib/site-content";
import { useSiteContent } from "@/components/site-content-provider";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const { business, showReviews } = useSiteContent();
  const phoneHref = telHref(business.phone);
  // No reviews section on the page => no "Reviews" link pointing at it.
  const moreNav = MORE_NAV.filter((l) => l.href !== "/#reviews" || showReviews);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all",
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-background/40 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1536px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Sambal and Sakura home">
          <Wordmark />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 min-[1380px]:flex">
          {PRIMARY_NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition hover:bg-muted",
                pathname === l.href && "bg-muted text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
          {moreNav.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <OpenStatus className="mr-1 hidden 2xl:inline-flex" compact />
          <a
            href={phoneHref}
            className="hidden size-10 items-center justify-center rounded-full border border-border transition hover:bg-muted lg:max-[1380px]:inline-flex 2xl:inline-flex"
            aria-label="Call the restaurant"
          >
            <Phone className="size-4" />
          </a>
          <LanguageSwitcher className="hidden md:inline-flex" />
          <ThemeToggle className="hidden md:inline-flex" />
          {/* Tablet: compact icon (space is tight). Desktop (xl+): clear Log in / Sign up. */}
          <span className="hidden md:max-[1380px]:inline-flex"><AccountButton /></span>
          <span className="hidden min-[1380px]:inline-flex"><AccountButton variant="nav" /></span>
          <CartButton />

          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="secondary" className="h-10 px-4">
              <Link href="/book">Book a Table</Link>
            </Button>
            <Button asChild className="h-10 px-5 font-semibold">
              <Link href="/order">Order Now</Link>
            </Button>
          </div>

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="inline-flex size-10 items-center justify-center rounded-full border border-border min-[1380px]:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
              <SheetHeader className="border-b border-border px-5 py-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Wordmark />
                <OpenStatus className="mt-1" />
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 py-4">
                {[...PRIMARY_NAV, ...moreNav].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-base font-medium transition hover:bg-muted"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="flex px-4 pb-3">
                <AccountButton variant="full" />
              </div>
              <div className="flex items-center gap-2 px-4">
                <ThemeToggle />
                <LanguageSwitcher />
                <a href={phoneHref} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-border text-sm font-medium">
                  <Phone className="size-4" /> Call
                </a>
              </div>
              <div className="mt-4 flex flex-col gap-2 px-4">
                <Button asChild variant="secondary" className="h-12" onClick={() => setOpen(false)}>
                  <Link href="/book">Book a Table</Link>
                </Button>
                <Button asChild className="h-12 font-semibold" onClick={() => setOpen(false)}>
                  <Link href="/order">Order Now</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
