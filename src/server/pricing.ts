import { type MenuItem } from "@/lib/data/menu";
import { ORDERING } from "@/lib/data/site";
import type { ZoneConfig } from "@/server/config";

/**
 * Server-authoritative pricing. The client sends only item ids + selected
 * modifier option ids + quantities; the server computes every price, fee and
 * discount from trusted config. Client-sent prices are ignored.
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
}

export function priceLine(line: IncomingLine, menu: MenuItem[]): PricedLine | null {
  const item = menu.find((m) => m.id === line.itemId);
  if (!item || item.soldOut) return null;
  const qty = Math.max(1, Math.min(50, Math.floor(line.qty || 1)));

  let unitPrice = item.price;
  const modifiers: PricedLine["modifiers"] = [];
  const selected = new Set(line.optionIds ?? []);

  for (const group of item.modifiers ?? []) {
    const chosen = group.options.filter((o) => selected.has(o.id));
    if (group.type === "single") {
      // exactly one for required single groups; take the first valid selection
      const opt = chosen[0] ?? (group.required ? group.options[0] : undefined);
      if (opt) { unitPrice += opt.priceDelta; modifiers.push({ groupId: group.id, optionId: opt.id, label: opt.label }); }
    } else {
      for (const opt of chosen) { unitPrice += opt.priceDelta; modifiers.push({ groupId: group.id, optionId: opt.id, label: opt.label }); }
    }
  }

  return { itemId: item.id, name: item.name, unitPrice: round2(unitPrice), qty, modifiers };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function outwardCode(pc: string): string {
  const n = pc.toUpperCase().replace(/\s+/g, "");
  return n.length <= 3 ? n : n.slice(0, n.length - 3);
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/i;
export function isValidPostcodeServer(pc: string): boolean {
  const n = pc.toUpperCase().replace(/\s+/g, "");
  return UK_POSTCODE.test(n) || OUTWARD.test(n);
}

export interface Zone { id: string; label: string; fee: number; etaMins: number }

export function findZone(postcode: string, zones: ZoneConfig[], disabledZones: string[]): Zone | null {
  const out = outwardCode(postcode);
  const z = zones.find((zz) => zz.postcodes.includes(out));
  if (!z || disabledZones.includes(z.id)) return null;
  return { id: z.id, label: z.label, fee: z.fee, etaMins: z.etaMins };
}

export interface Voucher { code: string; label: string; amountOff?: number; pctOff?: number; minSpend?: number }
const VOUCHERS: Record<string, Voucher> = {
  SAKURA10: { code: "SAKURA10", label: "10% off first order", pctOff: 10, minSpend: 12 },
  FAMILY52: { code: "FAMILY52", label: "Happy Family Feast", amountOff: 8, minSpend: 52 },
  FREEGYOZA: { code: "FREEGYOZA", label: "Free Chicken Gyoza", amountOff: 5.5, minSpend: 25 },
  WELCOME10: { code: "WELCOME10", label: "10% welcome", pctOff: 10, minSpend: 12 },
};

export function globalVoucher(code: string): Voucher | null {
  return VOUCHERS[code.toUpperCase().trim()] ?? null;
}

export interface Totals {
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  zone: Zone | null;
  minMet: boolean;
  inArea: boolean;
}

export function computeTotals(opts: {
  lines: IncomingLine[];
  fulfilment: "delivery" | "collection";
  postcode?: string;
  voucher?: Voucher | null;
  rewardAmount?: number; // £ discount for an owned account reward/voucher
  rewardPct?: number;
  disabledZones: string[];
  menu: MenuItem[];
  zones: ZoneConfig[];
}): Totals {
  const priced = opts.lines.map((l) => priceLine(l, opts.menu)).filter((l): l is PricedLine => l !== null);
  const subtotal = round2(priced.reduce((s, l) => s + l.unitPrice * l.qty, 0));

  const zone = opts.fulfilment === "delivery" && opts.postcode ? findZone(opts.postcode, opts.zones, opts.disabledZones) : null;
  const inArea = opts.fulfilment === "collection" || !!zone;
  const deliveryFee =
    opts.fulfilment === "collection" || !zone || subtotal >= ORDERING.freeDeliveryThreshold ? 0 : zone.fee;

  let discount = 0;
  const v = opts.voucher;
  if (v && (!v.minSpend || subtotal >= v.minSpend)) {
    if (v.pctOff) discount += round2((subtotal * v.pctOff) / 100);
    if (v.amountOff) discount += Math.min(v.amountOff, subtotal);
  }
  if (opts.rewardPct) discount += round2((subtotal * opts.rewardPct) / 100);
  if (opts.rewardAmount) discount += Math.min(opts.rewardAmount, subtotal);
  discount = round2(Math.min(discount, subtotal));

  const total = round2(Math.max(0, subtotal + deliveryFee - discount));
  const minMet = opts.fulfilment === "collection" ? subtotal > 0 : subtotal >= ORDERING.minOrder;

  return { lines: priced, subtotal, deliveryFee, discount, total, zone, minMet, inArea };
}

export const LOYALTY_POINTS_PER_POUND = 10;
