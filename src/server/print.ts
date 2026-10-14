// Sends kitchen tickets to a cloud-connected thermal printer. Two providers, chosen by what is configured:
//   1. Sunmi cloud printer (preferred)  SUNMI_APP_ID, SUNMI_APP_KEY, SUNMI_PRINTER_SN        -> src/server/sunmi.ts
//   2. PrintNode (any USB/LAN printer via a PC at the till)  PRINTNODE_API_KEY, PRINTNODE_PRINTER_ID
// With neither set, printing is skipped and the order still succeeds (tickets can still be printed from the admin).
// Printing must NEVER block or fail an order: every function here returns a result instead of throwing.

import { prisma } from "@/server/db";
import { RESTAURANT } from "@/lib/data/site";
import { getSiteContent } from "@/server/site-content";
import { getSunmiConfig, sunmiPush, sunmiOnline } from "@/server/sunmi";
import { renderKitchenTicket, renderCancelTicket, sampleTicketOrder, FLAG_TEXT, type TicketOrder } from "@/server/ticket";
import { log, alertOwner } from "@/server/log";

export type { TicketOrder };
export type PrinterProvider = "sunmi" | "printnode";
export interface PrintResult { ok: boolean; provider: PrinterProvider | null; message: string; detail?: string }

export function printerProvider(): PrinterProvider | null {
  if (getSunmiConfig()) return "sunmi";
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

async function printViaSunmi(order: TicketOrder, reprint: boolean, unique: boolean): Promise<PrintResult> {
  const { business } = await getSiteContent();
  const hex = renderKitchenTicket(order, { businessName: RESTAURANT.name, phone: business.phone }, { reprint }).toHex();
  // A fresh job id for reprints/tests so the cloud doesn't treat them as duplicates of the original.
  const tradeNo = reprint || unique ? `${order.id}R${Date.now().toString(36)}` : order.id;
  const r = await sunmiPush(tradeNo, hex, `New ${order.fulfilment === "delivery" ? "delivery" : "collection"} order`);
  return { ok: r.ok, provider: "sunmi", message: r.message, detail: r.raw || undefined };
}

/** Print a ticket. Never throws; returns what happened so the admin screens can show it. */
export async function printOrder(order: TicketOrder, opts: { reprint?: boolean; unique?: boolean } = {}): Promise<PrintResult> {
  const provider = printerProvider();
  if (!provider) return { ok: false, provider: null, message: "No kitchen printer is set up yet" };
  let result: PrintResult;
  try {
    result = provider === "sunmi" ? await printViaSunmi(order, !!opts.reprint, !!opts.unique) : await printViaPrintNode(order);
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
    flags, createdAt: o.createdAt,
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
    await prisma.order.update({ where: { id }, data: { printStatus: "not-needed", printError: "No kitchen printer set up" } }).catch(() => {});
    return { ok: false, provider: null, message: "No kitchen printer is set up yet" };
  }
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
  const ticket = { ...(await loadTicket(id))!, cancelReason: o.cancelReason, cancelledAt: o.cancelledAt };
  let result: PrintResult;
  try {
    if (provider === "sunmi") {
      const { business } = await getSiteContent();
      const hex = renderCancelTicket(ticket, { businessName: RESTAURANT.name, phone: business.phone }).toHex();
      const r = await sunmiPush(`${o.id}X${Date.now().toString(36)}`, hex, "Order cancelled");
      result = { ok: r.ok, provider: "sunmi", message: r.message, detail: r.raw || undefined };
    } else {
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
  const result = await printOrder(ticket, { reprint: true });
  if (result.ok) await prisma.order.update({ where: { id }, data: { printStatus: "printed", printedAt: new Date(), printError: null } }).catch(() => {});
  return result;
}

/** Admin "Send test print": a clearly-labelled sample ticket (includes Chinese text) + whether the printer is online. */
export async function printTest(): Promise<PrintResult & { online?: { ok: boolean; message: string; raw: string } }> {
  const result = await printOrder(sampleTicketOrder(), { unique: true });
  if (result.provider === "sunmi") return { ...result, online: await sunmiOnline() };
  return result;
}
