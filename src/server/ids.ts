import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";

// Codes customers or staff may read aloud: no 0/O, 1/I/L, so they're hard to mistype.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Cryptographically random code (not Math.random), e.g. randomCode(6) → "K7QX2M". */
export function randomCode(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export const orderRef = () => "SS-" + randomCode(6);   // ~887 million combinations
export const bookingRef = () => "BK-" + randomCode(6);
export const rewardCode = (prefix: string) => prefix + randomCode(6);

/** Name-based referral code with enough randomness to stay unique (e.g. "MEIL-7Q2K"). */
export function referralCode(name: string): string {
  const base = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "SAKU";
  return `${base}-${randomCode(4)}`;
}

/** True for a Prisma unique-constraint violation (optionally on a specific field). */
export function isUniqueViolation(e: unknown, field?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  if (!field) return true;
  const target = (e.meta?.target ?? "") as string | string[];
  return (Array.isArray(target) ? target.join(",") : String(target)).includes(field);
}

/**
 * Run `fn` and retry (with fresh random ids) if it hits a unique-constraint clash on one of the
 * given random-id fields. Other errors, including clashes on other fields, are re-thrown.
 */
export async function withFreshIds<T>(fn: () => Promise<T>, fields: string[], attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const clash = fields.some((f) => isUniqueViolation(e, f));
      if (!clash || i >= attempts) throw e;
    }
  }
}
