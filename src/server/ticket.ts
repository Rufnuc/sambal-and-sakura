import { Esc, COLS, padLine, wrap } from "@/server/escpos";
import { RECEIPT_LOGO } from "@/server/receipt-logo";

export interface TicketLine { name: string; unitPrice: number; qty: number; modifiers: string }
export interface TicketOrder {
  id: string; fulfilment: string; customerName: string; customerPhone: string;
  address: string | null; postcode: string | null; notes: string | null;
  whenType: string; scheduledTime: string | null; etaMins: number;
  subtotal: number; deliveryFee: number; discount: number; total: number; voucherCode: string | null;
  paymentMethod: string; paymentStatus: string;
  lines: TicketLine[];
  flags?: string[];
  createdAt?: Date;
  pointsEarned?: number;
}
export interface TicketContext {
  businessName: string; phone: string;
  // for the customer receipt
  tagline?: string; address?: string; website?: string; qrUrl?: string; qrLabel?: string; company?: string;
}

const money = (n: number) => `£${n.toFixed(2)}`;
function mods(s: string): string[] { try { return (JSON.parse(s) as { label: string }[]).map((m) => m.label); } catch { return []; } }

// Warnings printed on the ticket so staff act on them (set when the order is created).
export const FLAG_TEXT: Record<string, string> = {
  "new-customer": "NEW CUSTOMER - CALL TO CONFIRM",
  "address-unverified": "POSTCODE NOT VERIFIED - CHECK ADDRESS",
  "large-order": "LARGE ORDER - CALL TO CONFIRM",
  "paid-after-cancel": "PAID AFTER CANCEL - REFUND NEEDED",
  "frequent-canceller": "CANCELS OFTEN - CALL TO CONFIRM",
};

/** "Thu 9 Oct 18:42" in UK time (the server clock is UTC; the kitchen works in UK time). */
export function ukDateTime(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`;
}

/**
 * Kitchen / rider ticket for an 80mm thermal printer, laid out to be read at a glance.
 * The payment block comes FIRST and is printed white-on-black: it is the only place the payment
 * status appears, so text a customer typed (name, notes) can never pass for it.
 */
export function renderKitchenTicket(o: TicketOrder, ctx: TicketContext, opts: { reprint?: boolean } = {}): Esc {
  const e = new Esc().init();
  const delivery = o.fulfilment === "delivery";
  const wechat = o.paymentMethod === "wechat";

  // --- header
  e.align("center").bold(true).size(2, 2).line(delivery ? "DELIVERY" : "COLLECTION");
  e.line(`#${o.id}`);
  e.size(1, 1).bold(false);
  if (opts.reprint) e.bold(true).line("*** REPRINT ***").bold(false);
  e.line(ukDateTime(o.createdAt ?? new Date()));
  e.bold(true).size(1, 2).line(o.whenType === "scheduled" && o.scheduledTime ? `FOR ${o.scheduledTime}` : "ASAP").size(1, 1).bold(false);

  // --- payment block (reverse video): the line a rider must not get wrong
  e.feed(1).bold(true).reverse(true);
  if (wechat && o.paymentStatus === "paid") {
    e.size(1, 2).line(" PAID - WECHAT PAY ").line(" DO NOT COLLECT CASH ").size(1, 1);
  } else if (wechat) {
    e.size(1, 2).line(" WECHAT - NOT PAID YET ").size(1, 1).line(" Check payment before handing over ");
  } else {
    e.size(2, 2).line(` CASH ${money(o.total)} `).size(1, 1).line(delivery ? " COLLECT ON DELIVERY " : " PAY ON COLLECTION ");
  }
  e.reverse(false).bold(false).feed(1);

  // --- warnings
  for (const f of o.flags ?? []) {
    const text = FLAG_TEXT[f];
    if (text) e.bold(true).line(`!! ${text} !!`).bold(false);
  }
  e.rule();

  // --- customer (text typed by the customer is labelled as such)
  e.align("left").line("Customer:").bold(true).size(1, 2);
  for (const l of wrap(o.customerName, COLS)) e.line(l); // long names wrap cleanly instead of overflowing the paper
  e.size(1, 1).bold(false);
  for (const l of wrap(o.customerPhone, COLS)) e.line(l);
  if (delivery && (o.address || o.postcode)) {
    e.bold(true);
    for (const l of wrap(`${o.address ?? ""}${o.postcode ? ", " + o.postcode : ""}`, COLS)) e.line(l);
    e.bold(false);
  }
  e.rule();

  // --- items (double-height so they can be read across the kitchen)
  for (const l of o.lines) {
    const head = `${l.qty} x ${l.name}`;
    const price = l.unitPrice === 0 ? "FREE" : money(l.unitPrice * l.qty);
    const wrapped = wrap(head, COLS - price.length - 1);
    e.bold(true).size(1, 2).line(padLine(wrapped[0], price));
    for (const extra of wrapped.slice(1)) e.line("    " + extra);
    e.size(1, 1).bold(false);
    const m = mods(l.modifiers);
    if (m.length) for (const x of wrap(`+ ${m.join(", ")}`, COLS - 4)) e.line("    " + x);
  }
  e.rule();

  // --- totals
  e.line(padLine("Subtotal", money(o.subtotal)));
  if (o.deliveryFee > 0) e.line(padLine("Delivery", money(o.deliveryFee)));
  if (o.discount > 0) e.line(padLine(`Discount${o.voucherCode ? " " + o.voucherCode : ""}`, "-" + money(o.discount)));
  e.bold(true).size(1, 2).line(padLine("TOTAL", money(o.total))).size(1, 1).bold(false);
  e.rule();

  // --- notes
  if (o.notes) {
    e.bold(true).line("CUSTOMER NOTE (not payment info):").bold(false);
    for (const l of wrap(o.notes, COLS)) e.line(l);
    e.rule();
  }

  e.align("center").line(`Prep approx ${o.etaMins} min`).line(`Allergy query? ${ctx.phone}`).line("All food halal").line(ctx.businessName);
  e.feed(4).cut();
  return e;
}

/**
 * The customer's copy, printed after the kitchen ticket and packed with the food: the restaurant's
 * logo and details, what they ordered and paid, and a QR code (leave a review / order direct again).
 */
export function renderCustomerReceipt(o: TicketOrder, ctx: TicketContext): Esc {
  const e = new Esc().init();
  const delivery = o.fulfilment === "delivery";

  // --- brand header
  e.align("center").image(Buffer.from(RECEIPT_LOGO.bits, "base64"), RECEIPT_LOGO.width, RECEIPT_LOGO.height);
  e.bold(true).size(2, 2).line(ctx.businessName.toUpperCase()).size(1, 1);
  if (ctx.tagline) e.bold(false).line(ctx.tagline);
  e.bold(false);
  if (ctx.address) for (const l of wrap(ctx.address, COLS)) e.line(l);
  e.line(`Tel ${ctx.phone}`);
  if (ctx.website) e.bold(true).size(1, 2).line(ctx.website).size(1, 1).bold(false);
  e.rule("=");

  // --- the order
  e.bold(true).reverse(true).size(1, 2).line(delivery ? "  DELIVERY  " : "  COLLECTION  ").size(1, 1).reverse(false);
  e.size(2, 2).line(`#${o.id}`).size(1, 1).bold(false);
  e.line(ukDateTime(o.createdAt ?? new Date()));
  e.line(o.whenType === "scheduled" && o.scheduledTime ? `For ${o.scheduledTime}` : delivery ? `Delivery in about ${o.etaMins} min` : `Ready in about ${o.etaMins} min`);
  e.line(`Thank you, ${o.customerName.split(" ")[0]}!`);
  e.rule();

  // --- items
  e.align("left");
  for (const l of o.lines) {
    const price = l.unitPrice === 0 ? "FREE" : money(l.unitPrice * l.qty);
    const wrapped = wrap(`${l.qty} x ${l.name}`, COLS - price.length - 1);
    e.bold(true).line(padLine(wrapped[0], price)).bold(false);
    for (const extra of wrapped.slice(1)) e.line("    " + extra);
    const m = mods(l.modifiers);
    if (m.length) for (const x of wrap(`+ ${m.join(", ")}`, COLS - 4)) e.line("    " + x);
  }
  e.rule();

  // --- totals and payment
  e.line(padLine("Subtotal", money(o.subtotal)));
  if (delivery) e.line(padLine("Delivery", o.deliveryFee > 0 ? money(o.deliveryFee) : "FREE"));
  if (o.discount > 0) e.line(padLine(`Discount${o.voucherCode ? " " + o.voucherCode : ""}`, "-" + money(o.discount)));
  e.bold(true).size(2, 2).line(padLine("TOTAL", money(o.total), COLS / 2)).size(1, 1).bold(false);
  e.line(o.paymentMethod === "wechat" && o.paymentStatus === "paid" ? "Paid online - WeChat Pay"
    : o.paymentMethod === "wechat" ? "WeChat Pay - awaiting payment"
    : delivery ? "Cash - paid to the driver" : "Cash - paid on collection");
  if (o.pointsEarned && o.pointsEarned > 0) e.line(`You earned ${o.pointsEarned} reward points with this order`);
  e.rule("=");

  // --- QR and sign-off
  e.align("center");
  if (ctx.qrUrl) {
    e.bold(true).line(ctx.qrLabel ?? "Scan me").bold(false).feed(1).qr(ctx.qrUrl, 7);
  }
  e.feed(1).bold(true).size(1, 2).line("THANK YOU FOR ORDERING DIRECT").size(1, 1).bold(false);
  if (ctx.website) e.bold(true).line(`Order again at ${ctx.website}`).bold(false);
  e.line(`Allergies or a problem? Call ${ctx.phone}`);
  if (ctx.company) for (const l of wrap(ctx.company, COLS)) e.line(l);
  e.feed(4).cut();
  return e;
}

/** Printed when an order is cancelled after it went to the kitchen: impossible to miss. */
export function renderCancelTicket(o: TicketOrder & { cancelReason?: string | null; cancelledAt?: Date | null }, ctx: TicketContext): Esc {
  const e = new Esc().init();
  e.align("center").bold(true).reverse(true).size(2, 2).line(" CANCELLED ").size(1, 2).line(" STOP PREPARING ").size(1, 1).reverse(false);
  e.feed(1).size(2, 2).line(`#${o.id}`).size(1, 1);
  e.line(`Cancelled ${ukDateTime(o.cancelledAt ?? new Date())}`);
  e.line(`Ordered ${ukDateTime(o.createdAt ?? new Date())}`);
  e.bold(false).rule();
  e.align("left").bold(true).line(o.fulfilment === "delivery" ? "DELIVERY - DO NOT SEND" : "COLLECTION").bold(false);
  for (const l of wrap(o.customerName, COLS)) e.line(l);
  e.rule();
  for (const l of o.lines) for (const x of wrap(`${l.qty} x ${l.name}`, COLS)) e.line(x);
  e.rule();
  if (o.cancelReason) { e.line("Reason:"); for (const l of wrap(o.cancelReason, COLS)) e.line(l); e.rule(); }
  e.align("center").bold(true).line("Do not cook or send this order").bold(false).line(ctx.businessName);
  e.feed(4).cut();
  return e;
}

/** A clearly-labelled sample order for the admin "Send test print" button (includes Chinese text to test it). */
export function sampleTicketOrder(): TicketOrder {
  return {
    id: "TEST-PRINT", fulfilment: "delivery", customerName: "Test Customer", customerPhone: "07700 900123",
    address: "1 Example Street", postcode: "TS1 1AA", notes: "TEST PRINT - 测试打印 (no onions please). If you can read this, the printer works.",
    whenType: "asap", scheduledTime: null, etaMins: 30, subtotal: 17.7, deliveryFee: 1.99, discount: 0, total: 19.69, voucherCode: null,
    paymentMethod: "cash", paymentStatus: "unpaid", flags: ["new-customer"],
    lines: [
      { name: "Chicken Katsu Curry Don", unitPrice: 10.8, qty: 1, modifiers: JSON.stringify([{ label: "Extra sauce" }]) },
      { name: "Salt & Pepper Chips", unitPrice: 3.5, qty: 2, modifiers: "[]" },
    ],
  };
}
