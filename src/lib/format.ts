export function gbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Short money for offers: £5, £2.50 (no pence when it's whole pounds). */
export function gbpShort(amount: number): string {
  return `£${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

