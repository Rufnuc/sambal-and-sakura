import { z } from "zod";
import { isPlausiblePhone } from "@/server/phone";

const locale = z.enum(["en", "zh", "vi", "ja"]).catch("en").default("en"); // language for their emails

const phone = z.string().trim().min(7).max(20).refine(isPlausiblePhone, "Enter a valid phone number.");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).toLowerCase(),
  phone,
  password: z.string().min(8).max(100),
  marketingOptIn: z.boolean().default(false),
  locale,
  turnstileToken: z.string().max(2048).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(120).toLowerCase(),
  password: z.string().min(1).max(100),
});

export const updateAccountSchema = z.object({
  marketingOptIn: z.boolean().optional(),
  name: z.string().trim().min(2).max(80).optional(),
  phone: phone.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

const incomingLine = z.object({
  itemId: z.string().min(1).max(60),
  optionIds: z.array(z.string().max(60)).max(20).default([]),
  qty: z.number().int().min(1).max(50),
});

export const quoteSchema = z.object({
  lines: z.array(incomingLine).min(1).max(60),
  fulfilment: z.enum(["delivery", "collection"]),
  postcode: z.string().trim().max(10).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(20).optional(),
});

export const createOrderSchema = z.object({
  lines: z.array(incomingLine).min(1).max(60),
  fulfilment: z.enum(["delivery", "collection"]),
  postcode: z.string().trim().max(10).optional(),
  address: z.string().trim().max(300).optional(),
  name: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().email().max(120).toLowerCase(), // required: order/booking updates are sent by email
  notes: z.string().trim().max(500).optional(),
  whenType: z.enum(["asap", "scheduled"]).default("asap"),
  scheduledFor: z.string().trim().max(16).optional(), // "YYYY-MM-DD HH:MM", UK time
  voucherCode: z.string().trim().max(40).optional(),
  payMethod: z.enum(["cash", "wechat"]).default("cash"),
  expectedTotal: z.number().nonnegative().max(100000).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/).optional(),
  locale,
  turnstileToken: z.string().max(2048).optional(),
});

export const createBookingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().email().max(120).toLowerCase(), // required: order/booking updates are sent by email
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  party: z.number().int().min(1).max(20),
  occasion: z.string().trim().max(40).optional(),
  dietary: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
  locale,
  turnstileToken: z.string().max(2048).optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(["received", "preparing", "out-for-delivery", "ready-for-collection", "completed", "cancelled"]),
  reason: z.string().trim().max(200).optional(),
});

export const bookingStatusSchema = z.object({
  status: z.enum(["upcoming", "seated", "completed", "cancelled", "no-show", "delayed", "waitlist"]).optional(),
  tableId: z.string().max(10).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(5).max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  party: z.number().int().min(1).max(30).optional(),
  occasion: z.string().trim().max(40).optional(),
  dietary: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const settingsSchema = z.object({
  blackouts: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(365).optional(),
  disabledZones: z.array(z.string().max(10)).max(20).optional(),
});
