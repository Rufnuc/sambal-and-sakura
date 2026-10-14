import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar px-6 text-center text-sidebar-foreground">
      <LogoMark className="size-16" />
      <div>
        <p className="font-display text-7xl font-extrabold text-gold-ink">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold">This dish isn't on the menu</h1>
        <p className="mt-2 max-w-sm text-sidebar-foreground/70">
          The page you're after has wandered off. Let's get you back to the good stuff.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="h-12 px-6 font-semibold"><Link href="/menu">View the menu</Link></Button>
        <Button asChild variant="outline" className="h-12 border-sidebar-border bg-transparent px-6 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><Link href="/">Back home</Link></Button>
      </div>
    </main>
  );
}
