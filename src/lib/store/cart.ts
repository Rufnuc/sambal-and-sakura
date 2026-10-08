"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem } from "@/lib/data/menu";

export interface CartLine {
  lineId: string;
  itemId: string;
  name: string;
  unitPrice: number; // base + modifier deltas
  qty: number;
  modifiers: { groupId: string; optionId: string; label: string }[];
  image: string;
  notes?: string;
}

export type Fulfilment = "delivery" | "collection";

interface CartState {
  lines: CartLine[];
  fulfilment: Fulfilment;
  postcode: string;
  voucher: { code: string; label: string; amountOff?: number; pctOff?: number } | null;
  setFulfilment: (f: Fulfilment) => void;
  setPostcode: (p: string) => void;
  applyVoucher: (v: CartState["voucher"]) => void;
  addLine: (item: MenuItem, unitPrice: number, modifiers: CartLine["modifiers"], qty?: number) => void;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
}

function lineKey(itemId: string, modifiers: CartLine["modifiers"]) {
  return itemId + "::" + modifiers.map((m) => m.optionId).sort().join(",");
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      fulfilment: "delivery",
      postcode: "",
      voucher: null,
      setFulfilment: (f) => set({ fulfilment: f }),
      setPostcode: (p) => set({ postcode: p.toUpperCase().trim() }),
      applyVoucher: (v) => set({ voucher: v }),
      addLine: (item, unitPrice, modifiers, qty = 1) =>
        set((s) => {
          const key = lineKey(item.id, modifiers);
          const existing = s.lines.find((l) => lineKey(l.itemId, l.modifiers) === key);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.lineId === existing.lineId ? { ...l, qty: l.qty + qty } : l,
              ),
            };
          }
          return {
            lines: [
              ...s.lines,
              {
                lineId: key + "::" + Date.now().toString(36),
                itemId: item.id,
                name: item.name,
                unitPrice,
                qty,
                modifiers,
                image: item.image,
              },
            ],
          };
        }),
      setQty: (lineId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.lineId !== lineId)
              : s.lines.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
        })),
      removeLine: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
      clear: () => set({ lines: [], voucher: null }),
    }),
    { name: "ss_cart" },
  ),
);

// Derived selectors
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}
