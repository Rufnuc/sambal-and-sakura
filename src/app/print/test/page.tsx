import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser, staffFor } from "@/server/auth";
import { RESTAURANT } from "@/lib/data/site";
import { AutoPrint } from "@/components/print/auto-print";

// A test ticket for the "Windows printer" mode (Admin -> Orders -> Test print). ?embed=1 as on the order page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test print", robots: { index: false, follow: false } };

export default async function TestTicketPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  if (!(await currentUser())) redirect("/staff/login");
  if (!(await staffFor("orders"))) redirect("/admin");
  const { embed } = await searchParams;
  return (
    <div className="mx-auto max-w-[80mm] bg-white p-4 text-center font-mono text-[13px] leading-snug text-black print:max-w-none print:p-0">
      <style>{"@page { margin: 0; }"}</style>
      {embed !== "1" && <AutoPrint />}
      <p className="text-lg font-bold">{RESTAURANT.name}</p>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-xl font-extrabold">TEST PRINT</p>
      <p className="mt-1">If you can read this, the Windows printer works.</p>
      <p className="mt-1 text-[11px]">{new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
      <div className="my-2 border-t border-dashed border-black" />
    </div>
  );
}
