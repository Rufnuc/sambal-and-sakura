import type { Metadata } from "next";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

// A button (not an automatic unsubscribe on page load), so email scanners that open links can't
// unsubscribe people by accident.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = "", t = "" } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-extrabold">Unsubscribe from offers</h1>
      <p className="text-muted-foreground">You&apos;ll still get emails about your own orders and bookings.</p>
      <UnsubscribeButton u={u} t={t} />
    </main>
  );
}
