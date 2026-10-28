import type { OrderStatus } from "@/lib/data/site";
import type { CartLine, Fulfilment } from "@/lib/store/cart";

// Prices, fees, discounts and delivery zones are decided ONLY by the server (POST /api/orders/quote),
// so what the customer sees is exactly what they're charged. This file just holds shared types and
// an instant postcode-format hint for the form.

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function normalisePostcode(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, "");
}

/** Full UK postcode format, e.g. "TS1 3QP" (delivery needs the full postcode). */
export function isValidPostcode(pc: string): boolean {
  return UK_POSTCODE.test(normalisePostcode(pc));
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
  voucherCode?: string;
  handoverCode?: string; // the customer gives it to the driver / counter
  when: "asap" | "scheduled";
  scheduledTime?: string; // e.g. "Sat 11 Oct 19:00"
  etaMins: number;
  paymentMethod?: string; // cash | wechat
  paymentStatus?: string; // unpaid | paid
  printStatus?: string;   // pending | printed | failed | not-needed
  printError?: string;
  flags?: string[];
  cancelReason?: string;
  cancelKind?: string;   // customer | no-show | staff
  cancelledAt?: number;
}

/** Delivery prices from /api/public-config (admin settings), for "Delivery from £x · free on £y+" hints. */
export interface DeliveryHint { minOrder: number; freeOver: number | null; fromFee: number | null }

export function deliveryHintText(d: DeliveryHint | null): string {
  if (!d) return "";
  const gbp = (n: number) => `£${n.toFixed(2)}`;
  return [d.fromFee !== null ? `From ${gbp(d.fromFee)}` : "", d.freeOver !== null ? `free on ${gbp(d.freeOver)}+` : ""].filter(Boolean).join(" · ");
}
