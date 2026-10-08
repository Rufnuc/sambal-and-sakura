import { ORDERING, type OrderStatus } from "@/lib/data/site";
import { isZoneDisabled } from "@/lib/settings";
import type { CartLine, Fulfilment } from "@/lib/store/cart";

export interface DeliveryZone {
  id: string; label: string; fee: number; etaMins: number;
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function normalisePostcode(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, "");
}

/** Outward code = the part before the final 3 chars (inward). */
export function outwardCode(pc: string): string {
  const n = normalisePostcode(pc);
  if (n.length <= 3) return n;
  return n.slice(0, n.length - 3);
}

export function isValidPostcode(pc: string): boolean {
  const n = normalisePostcode(pc);
  return UK_POSTCODE.test(n) || OUTWARD.test(n);
}

export function findZone(pc: string): DeliveryZone | null {
  const out = outwardCode(pc);
  const zone = ORDERING.deliveryZones.find((z) => z.postcodes.includes(out));
  if (!zone || isZoneDisabled(zone.id)) return null; // operator may pause a zone
  return { id: zone.id, label: zone.label, fee: zone.fee, etaMins: zone.etaMins };
}

export function deliveryFee(zone: DeliveryZone | null, subtotal: number, fulfilment: Fulfilment): number {
  if (fulfilment === "collection") return 0;
  if (!zone) return 0;
  if (subtotal >= ORDERING.freeDeliveryThreshold) return 0;
  return zone.fee;
}

export interface Voucher { code: string; label: string; amountOff?: number; pctOff?: number; minSpend?: number }

const VOUCHERS: Record<string, Voucher> = {
  SAKURA10: { code: "SAKURA10", label: "10% off first order", pctOff: 10, minSpend: 12 },
  FAMILY52: { code: "FAMILY52", label: "Happy Family Feast", amountOff: 8, minSpend: 52 },
  FREEGYOZA: { code: "FREEGYOZA", label: "Free Chicken Gyoza", amountOff: 5.5, minSpend: 25 },
};

export function lookupVoucher(code: string): Voucher | null {
  return VOUCHERS[code.toUpperCase().trim()] ?? null;
}

export function voucherDiscount(subtotal: number, voucher: Voucher | null): number {
  if (!voucher) return 0;
  if (voucher.minSpend && subtotal < voucher.minSpend) return 0;
  if (voucher.pctOff) return Math.round(subtotal * voucher.pctOff) / 100;
  if (voucher.amountOff) return Math.min(voucher.amountOff, subtotal);
  return 0;
}

export function meetsMinimum(subtotal: number, fulfilment: Fulfilment): boolean {
  if (fulfilment === "collection") return subtotal > 0;
  return subtotal >= ORDERING.minOrder;
}

export interface PlacedOrder {
  id: string;
  createdAt: number;
  fulfilment: Fulfilment;
  status: OrderStatus;
  customer: { name: string; phone: string; address?: string; postcode?: string; notes?: string; email?: string; userId?: string };
  lines: CartLine[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  when: "asap" | string; // ISO for scheduled
  etaMins: number;
  paymentMethod?: string; // cash | wechat
  paymentStatus?: string; // unpaid | paid
}

const ORDERS_KEY = "ss_orders";

export function orderRef(): string {
  return "SS-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export function saveOrder(order: PlacedOrder) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    const list: PlacedOrder[] = raw ? JSON.parse(raw) : [];
    list.unshift(order);
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* ignore */ }
}

export function readOrders(): PlacedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as PlacedOrder[]) : [];
  } catch { return []; }
}

export function updateOrder(id: string, patch: Partial<PlacedOrder>): PlacedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const list = readOrders().map((o) => (o.id === id ? { ...o, ...patch } : o));
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
    return list;
  } catch { return readOrders(); }
}
