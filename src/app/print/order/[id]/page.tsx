import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { currentUser, staffFor } from "@/server/auth";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { gbp } from "@/lib/format";
import { AutoPrint } from "@/components/print/auto-print";

// Rendered on every request (live, admin-editable or per-visitor content).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order ticket", robots: { index: false, follow: false } };

type Mod = { groupId: string; optionId: string; label: string };
function parseMods(s: string): Mod[] { try { return JSON.parse(s); } catch { return []; } }

export default async function OrderTicketPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) redirect("/staff/login");
  if (!(await staffFor("orders"))) redirect("/admin");

  const { id } = await params;
  const { business: b } = await getSiteContent();
  const order = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!order) notFound();

  const placed = new Date(order.createdAt);
  const itemCount = order.lines.reduce((n, l) => n + l.qty, 0);
  const isDelivery = order.fulfilment === "delivery";

  return (
    <div className="mx-auto max-w-[80mm] bg-white p-4 font-mono text-[13px] leading-snug text-black print:max-w-none print:p-0">
      <AutoPrint />

      {/* Header */}
      <div className="text-center">
        <p className="text-lg font-bold tracking-tight">{RESTAURANT.name}</p>
        <p className="text-[11px]">{b.address.line1}, {b.address.city} {b.address.postcode}</p>
        <p className="text-[11px]">{b.phone}</p>
      </div>

      <Hr />

      {/* Order type banner */}
      <div className="text-center">
        <p className="text-xl font-extrabold uppercase">{isDelivery ? "Delivery" : "Collection"}</p>
        <p className="text-2xl font-extrabold tracking-wider">{order.id}</p>
        <p className="text-[11px]">{placed.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        <p className="text-[11px] uppercase">
          {order.whenType === "scheduled" && order.scheduledTime ? `SCHEDULED ${order.scheduledTime}` : "ASAP"}
          {" · "}{order.status.replace(/-/g, " ")}
        </p>
        {/* Staff copy only: the customer gives this code before the food is handed over. */}
        {order.handoverCode && <p className="mt-1 border-2 border-black p-1 text-lg font-extrabold">ASK FOR CODE: {order.handoverCode}</p>}
      </div>

      <Hr />

      {/* Customer */}
      <div className="space-y-0.5">
        <p className="font-bold">{order.customerName}</p>
        <p>{order.customerPhone}</p>
        {isDelivery && order.address && <p className="font-bold">{order.address}{order.postcode ? `, ${order.postcode}` : ""}</p>}
      </div>

      <Hr />

      {/* Items */}
      <div className="space-y-2">
        {order.lines.map((l) => {
          const mods = parseMods(l.modifiers);
          return (
            <div key={l.id}>
              <div className="flex justify-between font-bold">
                <span>{l.qty}× {l.name}</span>
                <span>{gbp(l.unitPrice * l.qty)}</span>
              </div>
              {mods.length > 0 && (
                <p className="pl-4 text-[11px]">+ {mods.map((m) => m.label).join(", ")}</p>
              )}
            </div>
          );
        })}
      </div>

      <Hr />

      {/* Totals */}
      <div className="space-y-0.5">
        <Row label={`Subtotal (${itemCount} item${itemCount === 1 ? "" : "s"})`} value={gbp(order.subtotal)} />
        {order.deliveryFee > 0 && <Row label="Delivery" value={gbp(order.deliveryFee)} />}
        {order.discount > 0 && <Row label={`Discount${order.voucherCode ? ` ${order.voucherCode}` : ""}`} value={`- ${gbp(order.discount)}`} />}
        <div className="mt-1 flex justify-between border-t border-dashed border-black pt-1 text-base font-extrabold">
          <span>{order.paymentMethod === "wechat" ? "TOTAL" : "TOTAL — CASH"}</span><span>{gbp(order.total)}</span>
        </div>
        {order.paymentMethod === "wechat" && (
          <p className="mt-1 border border-black p-1 text-center text-sm font-extrabold">
            {order.paymentStatus === "paid" ? "PAID - WECHAT PAY · DO NOT COLLECT CASH" : "WECHAT PAY - AWAITING PAYMENT"}
          </p>
        )}
      </div>

      <Hr />

      {/* Notes */}
      {order.notes && (
        <>
          <p className="text-[11px] font-bold uppercase">Notes</p>
          <p className="mb-1">{order.notes}</p>
        </>
      )}
      <p className="text-center text-[11px]">Prep approx {order.etaMins} min{order.paymentMethod === "wechat" ? "" : ` · payment: CASH on ${isDelivery ? "delivery" : "collection"}`}</p>
      <p className="text-center text-[10px]">Allergy query? Customer to phone {b.phone}.</p>

      <Hr />
      <p className="text-center text-[10px]">Thank you — {RESTAURANT.name}. All food halal.</p>
    </div>
  );
}

function Hr() { return <div className="my-2 border-t border-dashed border-black" />; }
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span>{label}</span><span>{value}</span></div>;
}
