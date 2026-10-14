"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import type { AuthDialog as AuthDialogType } from "@/components/account/auth-dialog";

// The sign-in / sign-up dialog (forms, bot check, validation) is only downloaded the first time
// someone opens it, so it isn't part of every page's JavaScript.
const AuthDialog = dynamic(() => import("@/components/account/auth-dialog").then((m) => m.AuthDialog), { ssr: false });

export function LazyAuthDialog(props: ComponentProps<typeof AuthDialogType>) {
  const [wanted, setWanted] = useState(props.open);
  if (props.open && !wanted) setWanted(true); // once opened, stays mounted (keeps the closing animation)
  return wanted ? <AuthDialog {...props} /> : null;
}
