/**
 * Normalise a UK phone number so "07700 900123", "+44 7700 900123" and "447700900123"
 * are treated as the same customer (used for "one per customer" offers and rate limits).
 */
export function phoneKey(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0044")) d = d.slice(4);
  else if (d.startsWith("44") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** One stored format per number: UK numbers as "07700900123", others as "+<digits>". */
export function canonicalPhone(raw: string): string {
  const k = phoneKey(raw);
  if (k.length === 10 && /^[1-37]/.test(k)) return "0" + k;
  const digits = raw.replace(/\D/g, "");
  return raw.trim().startsWith("+") ? "+" + digits : digits || raw.trim();
}

/** A plausible phone number: 10-11 digits once normalised (UK), or 8-15 for international. */
export function isPlausiblePhone(raw: string): boolean {
  const k = phoneKey(raw);
  return k.length >= 8 && k.length <= 15;
}
