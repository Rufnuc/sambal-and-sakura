import type { Metadata } from "next";

// Personal page: never indexed.
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
