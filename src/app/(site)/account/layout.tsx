import type { Metadata } from "next";

// Rendered on every request (live, admin-editable or per-visitor content).
export const dynamic = "force-dynamic";

// Personal page: never indexed.
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
