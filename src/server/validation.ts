import { z } from "zod";
import { isPlausiblePhone } from "@/server/phone";
import { zText, zCode, zId, zPostcode, zEmail, zPhoneText } from "@/server/sanitize";

// Every request body is validated here, and all free text is sanitised on the way in
// (see server/sanitize.ts). Passwords are the one thing never altered.

const locale = z.enum(["en", "zh", "vi", "ja"]).catch("en").default("en"); // language for their emails

const phone = zPhoneText.pipe(z.string().min(7)).refine(isPlausiblePhone, "Enter a valid phone number.");
const personName = zText(80, { min: 2 });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const turnstileToken = z.string().max(2048).regex(/^[A-Za-z0-9._-]*$/).optional();

export const registerSchema = z.object({
  name: personName,
  email: zEmail,
  phone,
  password: z.string().min(8).max(100),
  marketingOptIn: z.boolean().default(false),
  locale,
  turnstileToken,
});

export const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1).max(100),
});

export const updateAccountSchema = z.object({
  marketingOptIn: z.boolean().optional(),
  name: personName.optional(),
  phone: phone.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

const incomingLine = z.object({
  itemId: zId(60),
  optionIds: z.array(zId(60)).max(20).default([]),
  qty: z.number().int().min(1).max(50),
});

export const quoteSchema = z.object({
  lines: z.array(incomingLine).min(1).max(60),
  fulfilment: z.enum(["delivery", "collection"]),
  postcode: zPostcode.optional(),
  voucherCode: zCode(40).optional(),
  phone: zPhoneText.optional(),
});

export const createOrderSchema = z.object({
  lines: z.array(incomingLine).min(1).max(60),
  fulfilment: z.enum(["delivery", "collection"]),
  postcode: zPostcode.optional(),
  address: zText(300).optional(),
  name: personName,
  phone,
  email: zEmail, // required: order/booking updates are sent by email
  notes: zText(500, { multiline: true }).optional(),
  whenType: z.enum(["asap", "scheduled"]).default("asap"),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).optional(), // "YYYY-MM-DD HH:MM", UK time
  voucherCode: zCode(40).optional(),
  payMethod: z.enum(["cash", "wechat"]).default("cash"),
  expectedTotal: z.number().nonnegative().max(100000).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/).optional(),
  locale,
  turnstileToken,
});

export const createBookingSchema = z.object({
  name: personName,
  phone,
  email: zEmail, // required: order/booking updates are sent by email
  date: dateKey,
  time: hhmm,
  party: z.number().int().min(1).max(20),
  occasion: zText(40).optional(),
  dietary: zText(200).optional(),
  notes: zText(300, { multiline: true }).optional(),
  locale,
  turnstileToken,
});

export const orderStatusSchema = z.object({
  status: z.enum(["received", "preparing", "out-for-delivery", "ready-for-collection", "completed", "cancelled"]),
  reason: zText(200).optional(),
  // Why it was cancelled: "customer" (they asked) and "no-show" (not collected) count against the customer.
  cancelKind: z.enum(["customer", "no-show", "staff"]).optional(),
});

export const bookingStatusSchema = z.object({
  status: z.enum(["upcoming", "seated", "completed", "cancelled", "no-show", "delayed", "waitlist"]).optional(),
  tableId: zId(10).optional(),
  name: personName.optional(),
  phone: zPhoneText.pipe(z.string().min(5)).optional(),
  date: dateKey.optional(),
  time: hhmm.optional(),
  party: z.number().int().min(1).max(30).optional(),
  occasion: zText(40).optional(),
  dietary: zText(200).optional(),
  notes: zText(300, { multiline: true }).optional(),
});

export const settingsSchema = z.object({
  blackouts: z.array(dateKey).max(365).optional(),
  disabledZones: z.array(zId(10)).max(20).optional(),
});
