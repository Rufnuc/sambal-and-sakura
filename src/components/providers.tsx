"use client";

import { ThemeProvider } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/store/auth";
import { LanguageProvider } from "@/lib/i18n/context";
import { AutoTranslator } from "@/components/i18n/auto-translator";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Hydrate the signed-in user from the session cookie.
    useAuth.getState().refresh();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <LanguageProvider>
        <AutoTranslator />
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
