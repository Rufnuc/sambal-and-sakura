import type { Metadata } from "next";

// Rendered on every request (live, admin-editable or per-visitor content).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/book" },
  title: "Book a Table",
  description: "Reserve a table at Sambal & Sakura. Pick a date, time and party size and get instant confirmation by email.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
