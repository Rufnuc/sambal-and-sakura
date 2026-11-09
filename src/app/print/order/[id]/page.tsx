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

// ?copy=kitchen (default) | receipt (the customer's copy: no handover code or contact details) | cancel (STOP ticket).
// ?embed=1: opened inside the admin's "Windows printer" mode, which prints it itself (no toolbar, no auto print).
type Copy = "kitchen" | "receipt" | "cancel";

export default async function OrderTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copy?: string; embed?: string }> }) {
  if (!(await currentUser())) redirect("/staff/login");
  if (!(await staffFor("orders"))) redirect("/admin");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const copy: Copy = sp.copy === "receipt" || sp.copy === "cancel" ? sp.copy : "kitchen";
  const staffCopy = copy !== "receipt";
  const { business: b } = await getSiteContent();
  const order = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!order) notFound();

  const placed = new Date(order.createdAt);
  const itemCount = order.lines.reduce((n, l) => n + l.qty, 0);
  const isDelivery = order.fulfilment === "delivery";

  return (
    <div className="mx-auto max-w-[80mm] bg-white p-4 font-mono text-[13px] leading-snug text-black print:max-w-none print:p-0">
      {/* The receipt printer's own paper size; no browser margins, headers or footers. */}
      <style>{"@page { margin: 0; }"}</style>
      {sp.embed !== "1" && <AutoPrint />}

      {copy === "cancel" && (
        <div className="mb-2 border-4 border-black p-2 text-center">
          <p className="text-2xl font-extrabold">CANCELLED</p>
          <p className="text-lg font-extrabold">STOP PREPARING</p>
          {order.cancelReason && <p className="mt-1 text-[11px]">{order.cancelReason}</p>}
        </div>
      )}

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
        {copy === "kitchen" && order.handoverCode && <p className="mt-1 border-2 border-black p-1 text-lg font-extrabold">ASK FOR CODE: {order.handoverCode}</p>}
      </div>

      <Hr />

      {/* Customer (the customer's own copy just says thank you) */}
      <div className="space-y-0.5">
        <p className="font-bold">{staffCopy ? order.customerName : `Thank you, ${order.customerName.split(" ")[0]}!`}</p>
        {staffCopy && <p>{order.customerPhone}</p>}
        {staffCopy && isDelivery && order.address && <p className="font-bold">{order.address}{order.postcode ? `, ${order.postcode}` : ""}</p>}
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
        {order.onlineDiscount > 0 && <Row label={order.onlineDiscountLabel ?? "Online order discount"} value={`- ${gbp(order.onlineDiscount)}`} />}
        {order.balanceDiscount > 0 && <Row label="Prepaid balance discount" value={`- ${gbp(order.balanceDiscount)}`} />}
        {order.discount - order.onlineDiscount - order.balanceDiscount > 0.004 && <Row label={`Discount${order.voucherCode ? ` ${order.voucherCode}` : ""}`} value={`- ${gbp(order.discount - order.onlineDiscount - order.balanceDiscount)}`} />}
        <div className="mt-1 flex justify-between border-t border-dashed border-black pt-1 text-base font-extrabold">
          <span>{order.paymentMethod === "wechat" || order.balancePaid > 0 ? "TOTAL" : "TOTAL — CASH"}</span><span>{gbp(order.total)}</span>
        </div>
        {order.balancePaid > 0 && (
          <>
            <Row label="Paid from balance" value={`- ${gbp(order.balancePaid)}`} />
            <p className="mt-1 border border-black p-1 text-center text-sm font-extrabold">
              {order.total - order.balancePaid <= 0.004 ? "PAID FROM BALANCE · DO NOT COLLECT CASH" : `CASH TO COLLECT: ${gbp(order.total - order.balancePaid)}`}
            </p>
          </>
        )}
        {order.paymentMethod === "wechat" && (
          <p className="mt-1 border border-black p-1 text-center text-sm font-extrabold">
            {order.paymentStatus === "paid" ? "PAID - WECHAT PAY · DO NOT COLLECT CASH" : "WECHAT PAY - AWAITING PAYMENT"}
          </p>
        )}
      </div>

      <Hr />

      {!staffCopy && order.onlineDiscount > 0 && <p className="text-center font-bold">You saved {gbp(order.onlineDiscount)} by ordering direct</p>}

      {/* Notes */}
      {staffCopy && order.notes && (
        <>
          <p className="text-[11px] font-bold uppercase">Notes</p>
          <p className="mb-1">{order.notes}</p>
        </>
      )}
      <p className="text-center text-[11px]">Prep approx {order.etaMins} min{order.paymentMethod === "wechat" || order.paymentMethod === "balance" ? "" : ` · payment: CASH on ${isDelivery ? "delivery" : "collection"}`}</p>
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
