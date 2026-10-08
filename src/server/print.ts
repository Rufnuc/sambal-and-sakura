// Auto-print new orders to a thermal printer via PrintNode (https://printnode.com).
// PrintNode runs a tiny client on the till PC and exposes almost any USB/network
// thermal printer over a cloud API — the standard "just works" setup for takeaways.
//
// Enable by setting in .env (no secrets are hard-coded here):
//   PRINTNODE_API_KEY=xxxxxxxx        (from your PrintNode account)
//   PRINTNODE_PRINTER_ID=12345        (numeric id of the kitchen printer)
// When unset, printing is skipped silently and the order still succeeds.

import { prisma } from "@/server/db";

interface TicketLine { name: string; unitPrice: number; qty: number; modifiers: string }
interface TicketOrder {
  id: string; fulfilment: string; customerName: string; customerPhone: string;
  address: string | null; postcode: string | null; notes: string | null;
  whenType: string; scheduledTime: string | null; etaMins: number;
  subtotal: number; deliveryFee: number; discount: number; total: number; voucherCode: string | null;
  paymentMethod: string; paymentStatus: string;
  lines: TicketLine[];
}

const money = (n: number) => `£${n.toFixed(2)}`;
function parseMods(s: string): { label: string }[] { try { return JSON.parse(s); } catch { return []; } }

// 32-char wide plain-text layout for an 80mm thermal printer.
function renderText(o: TicketOrder): string {
  const W = 32;
  const rule = "-".repeat(W);
  const center = (s: string) => s.length >= W ? s : " ".repeat(Math.floor((W - s.length) / 2)) + s;
  const row = (l: string, r: string) => {
    const space = Math.max(1, W - l.length - r.length);
    return l + " ".repeat(space) + r;
  };
  const isDelivery = o.fulfilment === "delivery";
  const out: string[] = [];
  out.push(center("SAMBAL & SAKURA"));
  out.push(center("Middlesbrough TS1 3QP"));
  out.push(rule);
  out.push(center((isDelivery ? "DELIVERY" : "COLLECTION").padEnd(0)));
  out.push(center(o.id));
  out.push(center(o.whenType === "scheduled" && o.scheduledTime ? `SCHEDULED ${o.scheduledTime}` : "ASAP"));
  out.push(rule);
  out.push(o.customerName);
  out.push(o.customerPhone);
  if (isDelivery && o.address) out.push(`${o.address}${o.postcode ? ", " + o.postcode : ""}`);
  out.push(rule);
  for (const l of o.lines) {
    out.push(row(`${l.qty}x ${l.name}`.slice(0, W - 7), money(l.unitPrice * l.qty)));
    const mods = parseMods(l.modifiers);
    if (mods.length) out.push(`  + ${mods.map((m) => m.label).join(", ")}`.slice(0, W));
  }
  out.push(rule);
  out.push(row("Subtotal", money(o.subtotal)));
  if (o.deliveryFee > 0) out.push(row("Delivery", money(o.deliveryFee)));
  if (o.discount > 0) out.push(row(`Discount${o.voucherCode ? " " + o.voucherCode : ""}`, "-" + money(o.discount)));
  const wechat = o.paymentMethod === "wechat";
  if (wechat && o.paymentStatus === "paid") {
    out.push(row("TOTAL", money(o.total)));
    out.push(center("*** PAID - WECHAT PAY ***"));
    out.push(center("DO NOT COLLECT CASH"));
  } else if (wechat) {
    out.push(row("TOTAL", money(o.total)));
    out.push(center("WECHAT PAY - AWAITING PAYMENT"));
    out.push(center("Check before handing over"));
  } else {
    out.push(row("TOTAL CASH", money(o.total)));
  }
  out.push(rule);
  if (o.notes) { out.push("NOTES:"); out.push(o.notes); out.push(rule); }
  out.push(center(`Prep approx ${o.etaMins} min`));
  if (!wechat) out.push(center("Cash on " + (isDelivery ? "delivery" : "collection")));
  out.push(center("All food halal"));
  out.push("\n\n\n"); // feed before the cutter
  return out.join("\n");
}

export async function printOrder(order: TicketOrder): Promise<void> {
  const apiKey = process.env.PRINTNODE_API_KEY;
  const printerId = process.env.PRINTNODE_PRINTER_ID;
  if (!apiKey || !printerId) return; // not configured — skip

  const content = Buffer.from(renderText(order), "utf8").toString("base64");
  try {
    await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
      },
      body: JSON.stringify({
        printerId: Number(printerId),
        title: `Order ${order.id}`,
        contentType: "raw_base64",
        content,
        source: "Sambal & Sakura website",
      }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // Printing must never block or fail an order; the ticket is also printable from the admin.
  }
}

// Load an order by id and print it (used when a WeChat payment is confirmed).
export async function printOrderById(id: string): Promise<void> {
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!o) return;
  await printOrder({
    id: o.id, fulfilment: o.fulfilment, customerName: o.customerName, customerPhone: o.customerPhone,
    address: o.address, postcode: o.postcode, notes: o.notes,
    whenType: o.whenType, scheduledTime: o.scheduledTime, etaMins: o.etaMins,
    subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total,
    voucherCode: o.voucherCode, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, lines: o.lines,
  });
}
