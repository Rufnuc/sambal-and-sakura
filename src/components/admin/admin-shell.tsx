"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ShoppingBag, CalendarDays, LayoutGrid, UtensilsCrossed,
  Ticket, BarChart3, ExternalLink, Menu as MenuIcon, ChevronDown, Users, Settings, UserCog, Briefcase, FileText,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard, orders: ShoppingBag, bookings: CalendarDays, floor: LayoutGrid,
  customers: Users, menu: UtensilsCrossed, promos: Ticket, analytics: BarChart3,
  content: FileText, careers: Briefcase, staff: UserCog, settings: Settings,
};

interface Section { key: string; label: string; href: string }

export function AdminShell({ children, userName = "Staff", role = "admin", sections = [] }: { children: React.ReactNode; userName?: string; role?: string; sections?: Section[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/staff/login";
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {sections.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = ICONS[item.key] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4.5" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2 py-2">
          <LogoMark className="size-8" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold">Sambal &amp; Sakura</p>
            <p className="text-xs text-sidebar-foreground/60">Operations</p>
          </div>
        </Link>
        <div className="my-3 h-px bg-sidebar-border" />
        <NavLinks />
        <div className="mt-auto flex flex-col gap-2">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent/60 hover:text-sidebar-foreground">
            <ExternalLink className="size-4" /> View live site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex size-9 items-center justify-center rounded-lg border border-border lg:hidden" aria-label="Open menu">
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground">
              <SheetHeader className="px-0">
                <SheetTitle className="flex items-center gap-2 text-sidebar-foreground"><LogoMark className="size-7" /> Operations</SheetTitle>
              </SheetHeader>
              <div className="mt-4"><NavLinks onNavigate={() => setOpen(false)} /></div>
            </SheetContent>
          </Sheet>

          <p className="font-display text-lg font-bold lg:hidden">Operations</p>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
                <span className="hidden sm:inline">{userName}</span> <ChevronDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <p className="font-medium">{userName}</p>
                    <p className="text-xs font-normal capitalize text-muted-foreground">{role}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
