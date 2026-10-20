import { Esc, COLS, padLine, leaderLine, wrap } from "@/server/escpos";
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
 * Kitchen / rider ticket for an 80mm thermal printer, laid out to be read at a glance across the kitchen:
 * a black header band, big order number and time, then the payment block (white on black between thick
 * lines), warnings, customer, every item in large type, totals and the note. Lines are printed as
 * pictures (Esc.hr), so they come out solid on any firmware.
 * The payment block is the only place payment status appears, and customer text can never produce
 * white-on-black or lines, so a name or note can't pass for it.
 */
export function renderKitchenTicket(o: TicketOrder, ctx: TicketContext, opts: { reprint?: boolean } = {}): Esc {
  const e = new Esc().init();
  const delivery = o.fulfilment === "delivery";
  const wechat = o.paymentMethod === "wechat";

  // --- header
  e.band(delivery ? "DELIVERY" : "COLLECTION", 2, 2);
  e.feedDots(6).align("center").bold(true).size(2, 2).line(`#${o.id}`).size(1, 1).bold(false);
  if (opts.reprint) e.band("*** REPRINT ***");
  e.align("center").line(ukDateTime(o.createdAt ?? new Date()));
  e.bold(true).size(2, 2).line(o.whenType === "scheduled" && o.scheduledTime ? `FOR ${o.scheduledTime}` : "ASAP").size(1, 1).bold(false);

  // --- payment block: the line a rider must not get wrong
  e.hr("thick");
  if (wechat && o.paymentStatus === "paid") {
    e.band("PAID - WECHAT PAY", 1, 2).band("DO NOT COLLECT CASH");
  } else if (wechat) {
    e.band("WECHAT - NOT PAID YET", 1, 2).band("Check payment before handing over");
  } else {
    e.band(`CASH ${money(o.total)}`, 2, 2).band(delivery ? "COLLECT ON DELIVERY" : "PAY ON COLLECTION");
  }
  e.hr("thick");

  // --- warnings
  const warnings = (o.flags ?? []).map((f) => FLAG_TEXT[f]).filter(Boolean);
  if (warnings.length) {
    e.align("center");
    for (const w of warnings) e.bold(true).line(`!! ${w} !!`).bold(false);
    e.hr("dashed");
  }

  // --- customer (text typed by the customer is labelled as such)
  e.align("left").bold(true).line("CUSTOMER").bold(false);
  e.bold(true).size(1, 2);
  for (const l of wrap(o.customerName, COLS)) e.line(l); // long names wrap cleanly instead of overflowing the paper
  e.size(1, 1).bold(false);
  for (const l of wrap(o.customerPhone, COLS)) e.line(l);
  if (delivery && (o.address || o.postcode)) {
    e.bold(true);
    for (const l of wrap(`${o.address ?? ""}${o.postcode ? ", " + o.postcode : ""}`, COLS)) e.line(l);
    e.bold(false);
  }
  e.hr("double");

  // --- items (double-height so they can be read across the kitchen)
  e.bold(true).line(`ITEMS (${o.lines.reduce((n, l) => n + l.qty, 0)})`).bold(false).feedDots(4);
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
  e.hr("solid");

  // --- totals
  e.line(leaderLine("Subtotal", money(o.subtotal)));
  if (o.deliveryFee > 0) e.line(leaderLine("Delivery", money(o.deliveryFee)));
  if (o.discount > 0) e.line(leaderLine(`Discount${o.voucherCode ? " " + o.voucherCode : ""}`, "-" + money(o.discount)));
  e.bold(true).size(1, 2).line(padLine("TOTAL", money(o.total))).size(1, 1).bold(false);

  // --- notes
  if (o.notes) {
    e.hr("dashed");
    e.bold(true).line("CUSTOMER NOTE (not payment info):").bold(false);
    for (const l of wrap(o.notes, COLS)) e.line(l);
  }
  e.hr("double");

  e.align("center").line(`Prep approx ${o.etaMins} min  |  All food halal`).line(`Allergy query? ${ctx.phone}`).bold(true).line(ctx.businessName).bold(false);
  e.feed(4).cut();
  return e;
}

/**
 * The customer's copy, printed after the kitchen ticket and packed with the food: logo and a black
 * name band, the restaurant's details, the order in a ruled box, dish ... price with dotted leaders,
 * a black TOTAL bar, how it was paid, and a QR code (leave a review / order direct again).
 */
export function renderCustomerReceipt(o: TicketOrder, ctx: TicketContext): Esc {
  const e = new Esc().init();
  const delivery = o.fulfilment === "delivery";

  // --- brand header
  e.align("center").image(Buffer.from(RECEIPT_LOGO.bits, "base64"), RECEIPT_LOGO.width, RECEIPT_LOGO.height);
  e.band(ctx.businessName.toUpperCase(), 2, 2);
  e.feedDots(6).align("center");
  if (ctx.tagline) e.line(ctx.tagline);
  if (ctx.address) for (const l of wrap(ctx.address, COLS)) e.line(l);
  e.line(`Tel ${ctx.phone}`);
  if (ctx.website) e.bold(true).line(ctx.website).bold(false);
  e.hr("double");

  // --- the order, in a ruled box
  e.align("center").bold(true).size(1, 2).line(`${delivery ? "DELIVERY" : "COLLECTION"}  -  #${o.id}`).size(1, 1).bold(false);
  e.line(ukDateTime(o.createdAt ?? new Date()));
  e.line(o.whenType === "scheduled" && o.scheduledTime ? `For ${o.scheduledTime}` : delivery ? `Delivery in about ${o.etaMins} min` : `Ready in about ${o.etaMins} min`);
  e.hr("solid");
  e.bold(true).line(`Thank you, ${o.customerName.split(" ")[0]}!`).bold(false);
  e.hr("dotted");

  // --- items: dish ......... price
  e.align("left");
  for (const l of o.lines) {
    const price = l.unitPrice === 0 ? "FREE" : money(l.unitPrice * l.qty);
    const wrapped = wrap(`${l.qty} x ${l.name}`, COLS - price.length - 4);
    for (const extra of wrapped.slice(0, -1)) e.bold(true).line(extra).bold(false);
    e.bold(true).line(leaderLine(wrapped[wrapped.length - 1], price)).bold(false);
    const m = mods(l.modifiers);
    if (m.length) for (const x of wrap(`+ ${m.join(", ")}`, COLS - 4)) e.line("    " + x);
  }
  e.hr("solid");

  // --- totals and payment
  e.line(leaderLine("Subtotal", money(o.subtotal)));
  if (delivery) e.line(leaderLine("Delivery", o.deliveryFee > 0 ? money(o.deliveryFee) : "FREE"));
  if (o.discount > 0) e.line(leaderLine(`Discount${o.voucherCode ? " " + o.voucherCode : ""}`, "-" + money(o.discount)));
  e.feedDots(6).bandSplit("TOTAL", money(o.total), 2, 2).feedDots(6);
  e.align("center").line(o.paymentMethod === "wechat" && o.paymentStatus === "paid" ? "Paid online - WeChat Pay"
    : o.paymentMethod === "wechat" ? "WeChat Pay - awaiting payment"
    : delivery ? "Cash - paid to the driver" : "Cash - paid on collection");
  if (o.pointsEarned && o.pointsEarned > 0) e.bold(true).line(`* You earned ${o.pointsEarned} reward points *`).bold(false);
  e.hr("double");

  // --- QR and sign-off
  e.align("center");
  if (ctx.qrUrl) e.bold(true).line(ctx.qrLabel ?? "Scan me").bold(false).feedDots(8).qr(ctx.qrUrl, 7);
  e.feedDots(8).band("THANK YOU FOR ORDERING DIRECT", 1, 2).feedDots(6);
  e.align("center");
  if (ctx.website) e.bold(true).line(`Order again at ${ctx.website}`).bold(false);
  e.line(`Allergies or a problem? Call ${ctx.phone}`);
  e.hr("dotted");
  if (ctx.company) for (const l of wrap(ctx.company, COLS)) e.line(l);
  e.feed(4).cut();
  return e;
}

/** Printed when an order is cancelled after it went to the kitchen: impossible to miss. */
export function renderCancelTicket(o: TicketOrder & { cancelReason?: string | null; cancelledAt?: Date | null }, ctx: TicketContext): Esc {
  const e = new Esc().init();
  e.band("CANCELLED", 2, 2).band("STOP PREPARING", 1, 2);
  e.feedDots(6).align("center").bold(true).size(2, 2).line(`#${o.id}`).size(1, 1).bold(false);
  e.line(`Cancelled ${ukDateTime(o.cancelledAt ?? new Date())}`);
  e.line(`Ordered ${ukDateTime(o.createdAt ?? new Date())}`);
  e.hr("thick");
  e.align("left").bold(true).line(o.fulfilment === "delivery" ? "DELIVERY - DO NOT SEND" : "COLLECTION").bold(false);
  for (const l of wrap(o.customerName, COLS)) e.line(l);
  e.hr("dashed");
  for (const l of o.lines) for (const x of wrap(`${l.qty} x ${l.name}`, COLS)) e.line(x);
  if (o.cancelReason) { e.hr("dashed"); e.line("Reason:"); for (const l of wrap(o.cancelReason, COLS)) e.line(l); }
  e.hr("thick");
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
    paymentMethod: "cash", paymentStatus: "unpaid", flags: [],
    lines: [
      { name: "Chicken Katsu Curry Don", unitPrice: 10.8, qty: 1, modifiers: JSON.stringify([{ label: "Extra sauce" }]) },
      { name: "Salt & Pepper Chips", unitPrice: 3.5, qty: 2, modifiers: "[]" },
    ],
  };
}
