// Kitchen tickets. The kitchen printer (Xprinter XP-E260M, 80mm ESC/POS) is plugged into the kitchen tablet by
// USB and prints from the admin Orders screen through the tablet print queue at the bottom of this file.
// Optional server-side route, only if configured: PrintNode (a printer on a PC at the till) with
// PRINTNODE_API_KEY + PRINTNODE_PRINTER_ID. Without it, the order still succeeds and the tablet prints it.
// Printing must NEVER block or fail an order: every function here returns a result instead of throwing.

import { prisma } from "@/server/db";
import { RESTAURANT, COMPANY } from "@/lib/data/site";
import { formatAddress } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site-url";
import { getSiteContent } from "@/server/site-content";
import { renderKitchenTicket, renderCancelTicket, renderCustomerReceipt, sampleTicketOrder, FLAG_TEXT, type TicketOrder } from "@/server/ticket";
import { log, alertOwner } from "@/server/log";

export type { TicketOrder };
export type PrinterProvider = "printnode";
export interface PrintResult { ok: boolean; provider: PrinterProvider | null; message: string; detail?: string }

export function printerProvider(): PrinterProvider | null {
  if (process.env.PRINTNODE_API_KEY && process.env.PRINTNODE_PRINTER_ID) return "printnode";
  return null;
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
  out.push(center(o.whenType === "scheduled" && o.scheduledTime ? `FOR ${o.scheduledTime}` : "ASAP"));
  out.push(rule);
  // Payment status first, boxed: the only place it appears, so customer text can't imitate it.
  const wechatFirst = o.paymentMethod === "wechat";
  out.push("#".repeat(W));
  if (wechatFirst && o.paymentStatus === "paid") { out.push(center("PAID - WECHAT PAY")); out.push(center("DO NOT COLLECT CASH")); }
  else if (wechatFirst) { out.push(center("WECHAT - NOT PAID YET")); out.push(center("Check before handing over")); }
  else { out.push(center(`CASH ${money(o.total)}`)); out.push(center(isDelivery ? "COLLECT ON DELIVERY" : "PAY ON COLLECTION")); }
  out.push("#".repeat(W));
  for (const f of o.flags ?? []) if (FLAG_TEXT[f]) out.push(`!! ${FLAG_TEXT[f]} !!`.slice(0, W));
  out.push(rule);
  out.push("Customer:");
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
  out.push(row("TOTAL", money(o.total)));
  out.push(rule);
  if (o.notes) { out.push("CUSTOMER NOTE (not payment info):"); out.push(o.notes); out.push(rule); }
  out.push(center(`Prep approx ${o.etaMins} min`));
  out.push(center("All food halal"));
  out.push("\n\n\n"); // feed before the cutter
  return out.join("\n");
}

async function printViaPrintNode(order: TicketOrder): Promise<PrintResult> {
  const apiKey = process.env.PRINTNODE_API_KEY!;
  const printerId = process.env.PRINTNODE_PRINTER_ID!;
  const content = Buffer.from(renderText(order), "utf8").toString("base64");
  try {
    const res = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64") },
      body: JSON.stringify({ printerId: Number(printerId), title: `Order ${order.id}`, contentType: "raw_base64", content, source: "Sambal & Sakura website" }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok
      ? { ok: true, provider: "printnode", message: "Sent to PrintNode" }
      : { ok: false, provider: "printnode", message: `PrintNode returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, provider: "printnode", message: `Could not reach PrintNode: ${(e as Error).message}` };
  }
}

/** Print a ticket. Never throws; returns what happened so the admin screens can show it. */
export async function printOrder(order: TicketOrder): Promise<PrintResult> {
  const provider = printerProvider();
  if (!provider) return { ok: false, provider: null, message: "No kitchen printer is set up yet" };
  let result: PrintResult;
  try {
    result = await printViaPrintNode(order);
  } catch (e) {
    result = { ok: false, provider, message: `Print failed: ${(e as Error).message}` };
  }
  if (!result.ok) log.warn("print_failed", { orderId: order.id, provider: result.provider, message: result.message, detail: result.detail?.slice(0, 300) });
  return result;
}

async function loadTicket(id: string): Promise<TicketOrder | null> {
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!o) return null;
  let flags: string[] = [];
  try { flags = JSON.parse(o.flags); } catch { /* none */ }
  return {
    id: o.id, fulfilment: o.fulfilment, customerName: o.customerName, customerPhone: o.customerPhone,
    address: o.address, postcode: o.postcode, notes: o.notes,
    whenType: o.whenType, scheduledTime: o.scheduledTime, etaMins: o.etaMins,
    subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total,
    voucherCode: o.voucherCode, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, lines: o.lines,
    flags, createdAt: o.createdAt, pointsEarned: o.pointsEarned,
  };
}

/**
 * Print a new order's kitchen ticket and RECORD the outcome on the order (printStatus), so the
 * admin shows failures, the background worker retries them, and the owner gets an alert.
 */
export async function printNewOrder(id: string): Promise<PrintResult> {
  const ticket = await loadTicket(id);
  if (!ticket) return { ok: false, provider: printerProvider(), message: "Order not found" };
  if (!printerProvider()) {
    // Only if nothing printed it in the meantime (a tablet printer may already have claimed it).
    await prisma.order.updateMany({ where: { id, printStatus: "pending" }, data: { printStatus: "not-needed", printError: "No cloud printer set up" } }).catch(() => {});
    return { ok: false, provider: null, message: "No kitchen printer is set up yet" };
  }
  // Take the ticket first ("printing"), so the tablet printer (or a second retry) can't print it too.
  const lock = await prisma.order.updateMany({ where: { id, printStatus: { in: ["pending", "failed"] } }, data: { printStatus: "printing" } });
  if (lock.count !== 1) return { ok: true, provider: printerProvider(), message: "Already printed" };
  const result = await printOrder(ticket);
  const updated = await prisma.order.update({
    where: { id },
    data: result.ok
      ? { printStatus: "printed", printedAt: new Date(), printError: null, printAttempts: { increment: 1 } }
      : { printStatus: "failed", printError: result.message.slice(0, 300), printAttempts: { increment: 1 } },
    select: { printAttempts: true },
  }).catch(() => null);
  if (!result.ok) {
    void alertOwner("print_failed", `Kitchen printer failed for order ${id} (${result.message}). Check the printer and the Orders screen.`, { orderId: id, attempts: updated?.printAttempts });
  }
  return result;
}

/** "CANCELLED - STOP PREPARING" ticket for an order the kitchen may already be making. Alerts if it can't print. */
export async function printCancellation(id: string): Promise<PrintResult> {
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!o) return { ok: false, provider: printerProvider(), message: "Order not found" };
  const provider = printerProvider();
  if (!provider) return { ok: false, provider: null, message: "No kitchen printer is set up yet" };
  let result: PrintResult;
  try {
    {
      const text = `\n*** CANCELLED - STOP PREPARING ***\n\nOrder ${o.id}\n${o.customerName}\n${o.lines.map((l) => `${l.qty} x ${l.name}`).join("\n")}\n${o.cancelReason ? "Reason: " + o.cancelReason : ""}\n\nDO NOT COOK OR SEND THIS ORDER\n\n\n`;
      const res = await fetch("https://api.printnode.com/printjobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${process.env.PRINTNODE_API_KEY}:`).toString("base64") },
        body: JSON.stringify({ printerId: Number(process.env.PRINTNODE_PRINTER_ID), title: `CANCELLED ${o.id}`, contentType: "raw_base64", content: Buffer.from(text, "utf8").toString("base64"), source: "Sambal & Sakura website" }),
        signal: AbortSignal.timeout(6000),
      });
      result = { ok: res.ok, provider: "printnode", message: res.ok ? "Sent to PrintNode" : `PrintNode returned HTTP ${res.status}` };
    }
  } catch (e) {
    result = { ok: false, provider, message: `Print failed: ${(e as Error).message}` };
  }
  if (result.ok) await prisma.order.update({ where: { id }, data: { cancelPrintedAt: new Date() } }).catch(() => {});
  if (!result.ok) {
    log.warn("cancel_print_failed", { orderId: id, message: result.message });
    void alertOwner(`cancel-print:${id}`, `Order ${id} was CANCELLED but the STOP ticket didn't print (${result.message}). Tell the kitchen to stop preparing it.`);
  }
  return result;
}

/** Staff reprint from the admin. A successful reprint also clears a failed print status. */
export async function reprintOrder(id: string): Promise<PrintResult> {
  const ticket = await loadTicket(id);
  if (!ticket) return { ok: false, provider: printerProvider(), message: "Order not found" };
  const result = await printOrder(ticket);
  if (result.ok) await prisma.order.update({ where: { id }, data: { printStatus: "printed", printedAt: new Date(), printError: null } }).catch(() => {});
  return result;
}

/** Admin "Send test print": a clearly-labelled sample ticket (includes Chinese text) + whether the printer is online. */
export async function printTest(): Promise<PrintResult> {
  return printOrder(sampleTicketOrder());
}

/* ------------------------------------------------------------------ tablet (USB) printing */
// A printer plugged into the kitchen tablet (the Xprinter XP-E260M over USB) prints from the admin
// Orders screen in Chrome. The tablet asks for work every few seconds; each ticket is handed out
// ONCE (an atomic status change), so two tablets - or the tablet plus the cloud printer - never
// print the same ticket twice. If the cloud printer is set up and working, the tablet only picks up
// what the cloud failed to print (a backup).

const RECENT_MS = 3 * 3600_000;        // only tickets for orders from the last 3 hours
const CLOUD_GRACE_MS = 2 * 60_000;     // with a cloud printer, give it 2 minutes before the tablet steps in

export interface TabletJob { orderId: string; kind: "order" | "cancel"; bytes: string /* base64 ESC/POS */ }

async function ctx() {
  const { business } = await getSiteContent();
  const website = SITE_URL.replace(/^https?:\/\//, "");
  return {
    businessName: RESTAURANT.name, phone: business.phone,
    tagline: "Chinese & Japanese Kitchen", address: formatAddress(business.address), website,
    // With a Google review link set (Admin -> Site content), the QR asks for a review; otherwise it opens the site.
    qrUrl: business.googleReviewUrl ? `${SITE_URL}/review` : SITE_URL,
    qrLabel: business.googleReviewUrl ? "Enjoyed it? Scan to leave us a review" : "Scan to order direct next time",
    company: `${COMPANY.name} - Company no. ${COMPANY.number}`,
  };
}

/** ESC/POS bytes for an order's kitchen ticket or its "CANCELLED - STOP" ticket (no claiming). */
export async function ticketBytes(id: string, kind: "order" | "cancel", opts: { reprint?: boolean; receipt?: boolean } = {}): Promise<Buffer | null> {
  const o = await prisma.order.findUnique({ where: { id }, select: { cancelReason: true, cancelledAt: true } });
  const t = o ? await loadTicket(id) : null;
  if (!o || !t) return null;
  const c = await ctx();
  return kind === "cancel"
    ? renderCancelTicket({ ...t, cancelReason: o.cancelReason, cancelledAt: o.cancelledAt }, c).toBuffer()
    : opts.receipt
      ? renderKitchenTicket(t, c, opts).append(renderCustomerReceipt(t, c)).toBuffer() // kitchen ticket, cut, then the customer's copy
      : renderKitchenTicket(t, c, opts).toBuffer();
}

/** Test print: the sample kitchen ticket, then (unless switched off on the tablet) the customer receipt. */
export async function sampleTicketBytes(receipt = true): Promise<Buffer> {
  const c = await ctx(), o = sampleTicketOrder();
  return (receipt ? renderKitchenTicket(o, c).append(renderCustomerReceipt(o, c)) : renderKitchenTicket(o, c)).toBuffer();
}

/** Just the customer receipt (reprint it on its own from the order screen). */
export async function receiptBytes(id: string): Promise<Buffer | null> {
  const t = await loadTicket(id);
  return t ? renderCustomerReceipt(t, await ctx()).toBuffer() : null;
}

/** Hand the tablet every ticket that still needs printing, claiming each one so nobody else prints it. */
export async function claimTabletJobs(opts: { receipt?: boolean } = {}): Promise<TabletJob[]> {
  const since = new Date(Date.now() - RECENT_MS);
  const cloud = printerProvider() !== null;
  const waitFor = new Date(Date.now() - CLOUD_GRACE_MS);
  const paid = { OR: [{ paymentMethod: { not: "wechat" } }, { paymentStatus: "paid" }] }; // WeChat: only once paid
  const orderStatuses = cloud ? ["failed"] : ["not-needed", "pending", "failed"];
  const candidates = await prisma.order.findMany({
    where: {
      createdAt: { gte: since }, status: { notIn: ["cancelled", "completed"] }, ...paid,
      OR: [{ printStatus: { in: orderStatuses } }, ...(cloud ? [{ printStatus: "pending", createdAt: { lte: waitFor } }] : [])],
    },
    select: { id: true, printStatus: true }, orderBy: { createdAt: "asc" }, take: 20,
  });
  // Customer cancelled an order the kitchen already has a ticket for: print the STOP ticket.
  const stops = await prisma.order.findMany({
    where: { status: "cancelled", cancelKind: "customer", cancelledAt: { gte: since }, printedAt: { not: null }, cancelPrintedAt: null,
      ...(cloud ? { cancelledAt: { gte: since, lte: waitFor } } : {}) },
    select: { id: true }, take: 20,
  });
  const jobs: TabletJob[] = [];
  for (const o of candidates) {
    const claimed = await prisma.order.updateMany({
      where: { id: o.id, printStatus: o.printStatus },
      data: { printStatus: "printed", printedAt: new Date(), printError: null, printAttempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue; // someone else got it
    const bytes = await ticketBytes(o.id, "order", { receipt: opts.receipt });
    if (bytes) jobs.push({ orderId: o.id, kind: "order", bytes: bytes.toString("base64") });
  }
  for (const o of stops) {
    const claimed = await prisma.order.updateMany({ where: { id: o.id, cancelPrintedAt: null }, data: { cancelPrintedAt: new Date() } });
    if (claimed.count !== 1) continue;
    const bytes = await ticketBytes(o.id, "cancel");
    if (bytes) jobs.push({ orderId: o.id, kind: "cancel", bytes: bytes.toString("base64") });
  }
  return jobs;
}

/** The tablet couldn't print a ticket it claimed (printer unplugged, out of paper): put it back. */
export async function releaseTabletJob(orderId: string, kind: "order" | "cancel", error: string) {
  if (kind === "cancel") {
    await prisma.order.updateMany({ where: { id: orderId }, data: { cancelPrintedAt: null } });
    void alertOwner(`cancel-print:${orderId}`, `Order ${orderId} was CANCELLED but the tablet printer couldn't print the STOP ticket (${error}). Tell the kitchen to stop preparing it.`);
  } else {
    await prisma.order.updateMany({ where: { id: orderId, printStatus: "printed" }, data: { printStatus: "failed", printError: `Tablet printer: ${error}`.slice(0, 300), printedAt: null } });
    void alertOwner("print_failed", `Kitchen printer (tablet) failed for order ${orderId} (${error}). Check the printer and the Orders screen.`, { orderId });
  }
  log.warn("tablet_print_failed", { orderId, kind, error: error.slice(0, 200) });
}
