import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/book" },
  title: "Book a Table",
  description: "Reserve a table at Sambal & Sakura. Pick a date, time and party size and get instant confirmation by email.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
