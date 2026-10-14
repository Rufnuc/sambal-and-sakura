import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/order" },
  title: "Order Online for Delivery or Collection",
  description: "Order Chinese and Japanese food online from Sambal & Sakura for delivery or collection, see the total before you order, and track it live.",
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
