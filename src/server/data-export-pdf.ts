import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Booking, Order, OrderLine, PointsEntry, Reward } from "@prisma/client";
import { RESTAURANT, COMPANY } from "@/lib/data/site";
import { SITE_URL } from "@/lib/site-url";

// "Download my data" as a readable PDF (UK GDPR right of access). The same data is also offered as a
// JSON file for moving to another service (right to data portability), see src/app/api/account/route.ts.

type Account = { name: string; email: string; phone: string; points: number; referralCode: string; marketingOptIn: boolean; createdAt: Date };
type ExportData = {
  account: Account;
  orders: (Order & { lines: OrderLine[] })[];
  bookings: Booking[];
  rewards: Reward[];
  points: PointsEntry[];
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.42, 0.42, 0.42), GOLD = rgb(0.62, 0.45, 0.12);

const when = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d) : "-";
const money = (n: number) => `£${n.toFixed(2)}`;

export async function dataExportPdf(data: ExportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${RESTAURANT.name} - your data`);
  doc.setAuthor(COMPANY.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let lostChars = false;

  // The built-in PDF fonts only cover Western European letters: anything else (e.g. Chinese) is shown
  // as "?" here, and a note points to the data file, which keeps it exactly.
  const safe = (font: PDFFont, s: string) => {
    let out = "";
    for (const ch of s.replace(/[\r\t]/g, " ")) {
      try { font.encodeText(ch); out += ch; } catch { out += "?"; lostChars = true; }
    }
    return out;
  };

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - MARGIN; };
  const need = (h: number) => { if (y - h < MARGIN) newPage(); };

  /** Write text, wrapped to the page width. */
  function text(s: string, o: { size?: number; font?: PDFFont; color?: typeof INK; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10, font = o.font ?? regular, indent = o.indent ?? 0;
    const line = size * 1.35;
    for (const para of safe(font, s).split("\n")) {
      const words = para.split(" ");
      let cur = "";
      const flush = () => { need(line); page.drawText(cur, { x: MARGIN + indent, y: y - size, size, font, color: o.color ?? INK }); y -= line; cur = ""; };
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width - indent && cur) { flush(); cur = w; } else cur = next;
      }
      flush();
    }
    y -= o.gap ?? 0;
  }
  const heading = (s: string) => { need(40); y -= 10; text(s, { size: 14, font: bold, color: GOLD, gap: 4 }); };
  const field = (label: string, value: string) => text(`${label}: ${value || "-"}`, { indent: 0 });
  const rule = () => { need(10); page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: A4[0] - MARGIN, y: y - 4 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) }); y -= 10; };

  const a = data.account;
  text(`${RESTAURANT.name}: the information we hold about you`, { size: 18, font: bold, gap: 2 });
  text(`Prepared ${when(new Date())} for ${a.name} (${a.email}).`, { color: MUTED });
  text(`${COMPANY.name}, company no. ${COMPANY.number}, ${COMPANY.registeredOffice}.`, { color: MUTED, gap: 6 });

  heading("Your account");
  field("Name", a.name);
  field("Email", a.email);
  field("Phone", a.phone);
  field("Member since", when(a.createdAt));
  field("Reward points", String(a.points));
  field("Referral code", a.referralCode);
  field("Marketing emails", a.marketingOptIn ? "Yes, you opted in" : "No");

  heading(`Orders (${data.orders.length})`);
  if (!data.orders.length) text("No orders.", { color: MUTED });
  for (const o of data.orders) {
    need(60);
    text(`${o.id}  ·  ${when(o.createdAt)}  ·  ${o.fulfilment}  ·  ${o.status}`, { font: bold });
    for (const l of o.lines) {
      const opts = modifierLabels(l.modifiers);
      text(`${l.qty} x ${l.name}${opts ? ` (${opts})` : ""}  ${money(l.unitPrice * l.qty)}`, { indent: 12 });
    }
    text(`Food ${money(o.subtotal)} · delivery ${money(o.deliveryFee)}${o.discount ? ` · discount -${money(o.discount)}` : ""} · total ${money(o.total)} · paid by ${o.paymentMethod}${o.voucherCode ? ` · code ${o.voucherCode}` : ""}`, { indent: 12, color: MUTED });
    const contact = [o.customerName, o.customerPhone, o.customerEmail, [o.address, o.postcode].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    if (contact) text(`Details given: ${contact}`, { indent: 12, color: MUTED });
    if (o.notes) text(`Your note: ${o.notes}`, { indent: 12, color: MUTED });
    if (o.cancelReason) text(`Cancelled: ${o.cancelReason}`, { indent: 12, color: MUTED });
    rule();
  }

  heading(`Table bookings (${data.bookings.length})`);
  if (!data.bookings.length) text("No bookings.", { color: MUTED });
  for (const b of data.bookings) {
    text(`${b.date} at ${b.time}  ·  ${b.party} ${b.party === 1 ? "guest" : "guests"}  ·  ${b.status}`, { font: bold });
    const extra = [b.name, b.phone, b.email, b.occasion && `Occasion: ${b.occasion}`, b.dietary && `Dietary: ${b.dietary}`, b.notes && `Note: ${b.notes}`].filter(Boolean).join(" · ");
    if (extra) text(extra, { indent: 12, color: MUTED });
    rule();
  }

  heading(`Rewards and vouchers (${data.rewards.length})`);
  if (!data.rewards.length) text("None.", { color: MUTED });
  for (const r of data.rewards) {
    text(`${r.label} (${r.code})  ·  from ${r.source}  ·  ${r.used ? `used ${when(r.usedAt)}` : `expires ${when(r.expiresAt)}`}`);
  }

  heading(`Points history (${data.points.length})`);
  if (!data.points.length) text("None.", { color: MUTED });
  for (const p of data.points) text(`${when(p.createdAt)}  ·  ${p.delta > 0 ? "+" : ""}${p.delta}  ·  ${p.reason}  ·  ${p.status}`);

  y -= 10;
  if (lostChars) text("Some characters (for example Chinese) can't be shown in this PDF and appear as \"?\". The data file on your account page has them exactly.", { color: MUTED, size: 9 });
  text(`Questions about your data, or want something corrected or deleted? Contact us, or see our privacy policy at ${SITE_URL}/legal/privacy.`, { color: MUTED, size: 9 });

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: A4[0] - MARGIN - 30, y: 24, size: 8, font: regular, color: MUTED }));
  return doc.save();
}

/** Option labels saved on an order line ("Large, Extra pearls"). */
function modifierLabels(raw: string): string {
  try {
    const list = JSON.parse(raw) as { label?: string }[];
    return Array.isArray(list) ? list.map((m) => m.label).filter(Boolean).join(", ") : "";
  } catch { return ""; }
}
