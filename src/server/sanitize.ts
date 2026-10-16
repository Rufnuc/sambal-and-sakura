import { z } from "zod";

// Input sanitising for everything people type (customers, staff and the owner).
//
// Text is cleaned when a request is validated, before it's saved or used anywhere:
//   - Unicode normalised (NFC), so look-alike encodings compare equal
//   - control characters removed (keeps line breaks in multi-line fields)
//   - invisible / direction-override characters removed: zero-width spaces and the right-to-left
//     override trick can disguise text on tickets, emails and admin screens
//   - HTML tags removed (output is escaped everywhere too; this is a second line of defence for
//     printers, emails and anything we add later)
//   - whitespace tidied and lengths enforced
// Passwords are never altered (they're only hashed). Codes, ids and postcodes are restricted to the
// exact characters they can contain.

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;          // keeps \t \n \r for now
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￰-￻]/g;
const TAG = /<\/?[a-z!?][^<>]*>/gi;                                                // real-looking tags only ("a < b" survives)

export function cleanText(value: string, opts: { multiline?: boolean } = {}): string {
  let s = value.normalize("NFC").replace(INVISIBLE, "").replace(CONTROL, "").replace(TAG, "");
  s = s.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  if (opts.multiline) {
    s = s.split("\n").map((line) => line.replace(/ {2,}/g, " ").trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/\s+/g, " ");
  }
  return s.trim();
}

/** Free text: cleaned, then length-checked (the raw input may be a little longer before cleaning). */
export function zText(max: number, opts: { min?: number; multiline?: boolean } = {}) {
  return z.string().max(max * 2 + 50).transform((v) => cleanText(v, opts)).pipe(z.string().min(opts.min ?? 0).max(max));
}

/** Upper-case codes (voucher / reward codes): letters, digits and dashes only. */
export const zCode = (max: number) => z.string().max(max * 2).transform((v) => v.normalize("NFC").toUpperCase().replace(/[^A-Z0-9-]/g, "")).pipe(z.string().max(max));

/** Ids we generate or define (dish ids, option ids, table ids): letters, digits, dashes, underscores. */
export const zId = (max: number) => z.string().max(max).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

/** UK postcode: letters, digits and one space. */
export const zPostcode = z.string().max(20).transform((v) => v.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim()).pipe(z.string().max(10));

/** Email: cleaned, lower-cased, validated. */
export const zEmail = z.string().max(160).transform((v) => cleanText(v).replace(/\s/g, "").toLowerCase()).pipe(z.string().email().max(120));

/** Phone-ish input: only digits, spaces, +, (, ), - survive. */
export const zPhoneText = z.string().max(40).transform((v) => v.normalize("NFKC").replace(/[^\d+()\s-]/g, "").replace(/\s+/g, " ").trim()).pipe(z.string().max(20));

/** A search box value (admin): cleaned single line. */
export const cleanQuery = (v: string | null | undefined, max = 60) => cleanText(v ?? "").slice(0, max);

/** Spellings to try for a name search ("priya", "Priya", "PRIYA"): SQLite and Postgres differ on case. */
export function nameVariants(q: string): string[] {
  const lower = q.toLowerCase();
  const title = lower.replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return [...new Set([q, lower, title, q.toUpperCase()])];
}
