"use client";

import Link from "next/link";
import { useState } from "react";
import { User, LogOut, Gift, Star } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LazyAuthDialog as AuthDialog } from "@/components/account/lazy-auth-dialog";
import { useAuth } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// icon: compact user icon · nav: "Log in" + "Sign up" text buttons (desktop header)
// full: two full-width buttons (mobile menu)
export function AccountButton({ variant = "icon" }: { variant?: "icon" | "nav" | "full" }) {
  const { user, rewards, loaded, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const open = (m: "signin" | "signup") => { setMode(m); setAuthOpen(true); };

  if (!loaded) {
    return <div className={cn("rounded-full bg-muted", variant === "icon" ? "size-10" : variant === "nav" ? "h-10 w-32" : "h-11 w-full")} />;
  }

  if (!user) {
    return (
      <>
        {variant === "full" ? (
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={() => open("signin")}>Log in</Button>
            <Button className="h-11 font-semibold" onClick={() => open("signup")}>Sign up</Button>
          </div>
        ) : variant === "nav" ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="h-10 px-3 font-medium" onClick={() => open("signin")}>Log in</Button>
            <Button variant="outline" className="h-10 px-3 font-medium" onClick={() => open("signup")}>Sign up</Button>
          </div>
        ) : (
          <button
            onClick={() => open("signin")}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border transition hover:bg-muted"
            aria-label="Log in or sign up"
          >
            <User className="size-5" />
          </button>
        )}
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={mode} key={mode} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:opacity-90"
        aria-label="Account menu"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="font-medium">{user.name}</p>
            <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <Star className="size-4" /> {user.points} points
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account#rewards" />}>
            <Gift className="size-4" /> {rewards.filter((r) => !r.used).length} rewards
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account" />}>
            <User className="size-4" /> My account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout()}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
