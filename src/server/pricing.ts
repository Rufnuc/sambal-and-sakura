import type { Offer } from "@/lib/data/site";
import { type MenuItem } from "@/lib/data/menu";
import type { ZoneConfig, DeliveryRules } from "@/server/config";

/**
 * Server-authoritative pricing. The client sends only item ids + selected modifier option ids +
 * quantities; the server computes every price, fee and discount from trusted config.
 * Nothing is changed silently: unavailable items and invalid options are reported back so the
 * customer can confirm, instead of being dropped or swapped for a default.
 */

export interface IncomingLine {
  itemId: string;
  optionIds: string[]; // selected modifier option ids
  qty: number;
}
export interface PricedLine {
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  modifiers: { groupId: string; optionId: string; label: string }[];
  free?: boolean; // added by an offer (e.g. free gyoza), price 0
}
export interface LineIssue { itemId: string; name: string; problem: "unavailable" | "invalid-options" }

export const round2 = (n: number) => Math.round(n * 100) / 100;

type PriceResult = { line: PricedLine } | { issue: LineIssue };

export function priceLine(line: IncomingLine, menu: MenuItem[]): PriceResult {
  const item = menu.find((m) => m.id === line.itemId);
  // Phone-order dishes (seasonal price) are on the menu but can never be priced into an online order.
  if (!item || item.soldOut || item.phoneOrder) return { issue: { itemId: line.itemId, name: item?.name ?? "An item", problem: "unavailable" } };
  const qty = Math.max(1, Math.min(50, Math.floor(line.qty || 1)));
  const bad = { issue: { itemId: item.id, name: item.name, problem: "invalid-options" as const } };

  const groups = item.modifiers ?? [];
  const known = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  const selected = new Set(line.optionIds ?? []);
  if ([...selected].some((id) => !known.has(id))) return bad; // option from another dish / made up

  let unitPrice = item.price;
  const modifiers: PricedLine["modifiers"] = [];
  for (const group of groups) {
    const chosen = group.options.filter((o) => selected.has(o.id));
    if (group.type === "single" && chosen.length > 1) return bad;
    if (group.required && chosen.length === 0) return bad; // never pick a default the customer didn't choose
    for (const opt of chosen) { unitPrice += opt.priceDelta; modifiers.push({ groupId: group.id, optionId: opt.id, label: opt.label }); }
  }
  return { line: { itemId: item.id, name: item.name, unitPrice: round2(unitPrice), qty, modifiers } };
}

export function outwardCode(pc: string): string {
  const n = pc.toUpperCase().replace(/\s+/g, "");
  return n.length <= 3 ? n : n.slice(0, n.length - 3);
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
/** A full UK postcode (outward + inward). Delivery needs the full postcode, not just "TS1". */
export function isValidPostcodeServer(pc: string): boolean {
  return UK_POSTCODE.test(pc.toUpperCase().replace(/\s+/g, ""));
}

export interface Zone { id: string; label: string; fee: number; etaMins: number }

export function findZone(postcode: string, zones: ZoneConfig[], disabledZones: string[]): Zone | null {
  const out = outwardCode(postcode);
  const z = zones.find((zz) => zz.postcodes.includes(out));
  if (!z || disabledZones.includes(z.id)) return null;
  return { id: z.id, label: z.label, fee: z.fee, etaMins: z.etaMins };
}

export interface Voucher {
  code: string;
  label: string;
  amountOff?: number;
  pctOff?: number;
  minSpend?: number;
  freeItemId?: string;        // adds this dish free instead of money off
  onePerCustomer?: string;    // redemption group: one use per phone number, ever (e.g. "first-order")
  firstOrderOnly?: boolean;   // only if this phone / account has never ordered before
}

// Offer codes come from the owner's offers (Admin → Promotions → Offers): see offerVoucher().
// These are the values the original built-in codes had; they fill in offers that were saved before
// codes had their own settings, so nothing changes for those until the owner edits them.
export const LEGACY_CODE_VALUES: Record<string, Pick<Offer, "pctOff" | "amountOff" | "freeItemId" | "minSpend" | "firstOrderOnly">> = {
  SAKURA10: { pctOff: 10, minSpend: 12, firstOrderOnly: true },
  FAMILY52: { amountOff: 8, minSpend: 52 },
  FREEGYOZA: { freeItemId: "chicken-gyoza", minSpend: 25 },
  WELCOME10: { pctOff: 10, minSpend: 12, firstOrderOnly: true },
};

/** The checkout voucher for a public offer code, from the live offers list (null if no offer has it). */
export function offerVoucher(code: string, offers: Offer[]): Voucher | null {
  const c = code.toUpperCase().trim();
  const o = offers.find((x) => x.code && x.code.toUpperCase() === c);
  if (!o || !(o.pctOff || o.amountOff || o.freeItemId)) return null;
  return {
    code: c, label: o.title,
    pctOff: o.pctOff, amountOff: o.amountOff, freeItemId: o.freeItemId, minSpend: o.minSpend ?? 0,
    firstOrderOnly: o.firstOrderOnly || undefined,
    // First-order offers share one group (one first-order offer per customer); others can be once each.
    onePerCustomer: o.firstOrderOnly ? "first-order" : o.oncePerCustomer ? `offer:${c}` : undefined,
  };
}

export const AUTO_FREE_ITEM = { itemId: "chicken-gyoza", minSpend: 25 };


export interface Totals {
  lines: PricedLine[];
  issues: LineIssue[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  zone: Zone | null;
  minMet: boolean;
  inArea: boolean;
  voucherApplied: boolean; // false if the voucher's minimum spend wasn't reached
}

export function computeTotals(opts: {
  lines: IncomingLine[];
  autoFreeItem?: boolean; // the advertised free item over a spend (off while offers are switched off)
  fulfilment: "delivery" | "collection";
  postcode?: string;
  voucher?: Voucher | null;
  disabledZones: string[];
  menu: MenuItem[];
  zones: ZoneConfig[];
  delivery: DeliveryRules; // minimum order + free-delivery amount (admin setting)
}): Totals {
  const priced: PricedLine[] = [];
  const issues: LineIssue[] = [];
  for (const l of opts.lines) {
    const r = priceLine(l, opts.menu);
    if ("line" in r) priced.push(r.line); else issues.push(r.issue);
  }
  const subtotal = round2(priced.reduce((s, l) => s + l.unitPrice * l.qty, 0));

  const zone = opts.fulfilment === "delivery" && opts.postcode ? findZone(opts.postcode, opts.zones, opts.disabledZones) : null;
  const inArea = opts.fulfilment === "collection" || !!zone;
  const freeDelivery = opts.delivery.freeDeliveryOver !== null && subtotal >= opts.delivery.freeDeliveryOver;
  const deliveryFee = opts.fulfilment === "collection" || !zone || freeDelivery ? 0 : zone.fee;

  let discount = 0;
  let voucherApplied = false;
  const v = opts.voucher;
  if (v && (!v.minSpend || subtotal >= v.minSpend)) {
    voucherApplied = true;
    if (v.pctOff) discount += round2((subtotal * v.pctOff) / 100);
    if (v.amountOff) discount += Math.min(v.amountOff, subtotal);
    if (v.freeItemId) {
      const freeItem = opts.menu.find((m) => m.id === v.freeItemId && !m.soldOut);
      if (freeItem) priced.push({ itemId: freeItem.id, name: `${freeItem.name} (free - ${v.code})`, unitPrice: 0, qty: 1, modifiers: [], free: true });
      else voucherApplied = false; // the free dish is sold out: the offer can't apply
    }
  }
  // "Free Chicken Gyoza over £25" is auto-applied when no other offer is used ("one per order").
  if (opts.autoFreeItem !== false && !voucherApplied && subtotal >= AUTO_FREE_ITEM.minSpend) {
    const freeItem = opts.menu.find((m) => m.id === AUTO_FREE_ITEM.itemId && !m.soldOut);
    if (freeItem) priced.push({ itemId: freeItem.id, name: `${freeItem.name} (free over £${AUTO_FREE_ITEM.minSpend})`, unitPrice: 0, qty: 1, modifiers: [], free: true });
  }
  discount = round2(Math.min(discount, subtotal));

  const total = round2(Math.max(0, subtotal + deliveryFee - discount));
  // The delivery minimum is on the food subtotal before discounts.
  const minMet = opts.fulfilment === "collection" ? subtotal > 0 : subtotal >= opts.delivery.minOrder;

  return { lines: priced, issues, subtotal, deliveryFee, discount, total, zone, minMet, inArea, voucherApplied };
}

export const LOYALTY_POINTS_PER_POUND = 10;
