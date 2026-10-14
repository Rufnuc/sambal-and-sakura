import type { Metadata } from "next";
import { TrackOrder } from "@/components/order/track-order";

export const metadata: Metadata = { title: "Track your order", robots: { index: false, follow: false } };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t = "" } = await searchParams;
  return <TrackOrder id={id} token={t} />;
}
