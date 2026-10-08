import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).toLowerCase(),
  phone: z.string().trim().min(7).max(20),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(120).toLowerCase(),
  password: z.string().min(1).max(100),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
});

const incomingLine = z.object({
  itemId: z.string().min(1).max(60),
  optionIds: z.array(z.string().max(60)).max(20).default([]),
  qty: z.number().int().min(1).max(50),
});

export const createOrderSchema = z.object({
  lines: z.array(incomingLine).min(1).max(60),
  fulfilment: z.enum(["delivery", "collection"]),
  postcode: z.string().trim().max(10).optional(),
  address: z.string().trim().max(300).optional(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
  whenType: z.enum(["asap", "scheduled"]).default("asap"),
  scheduledTime: z.string().trim().max(10).optional(),
  voucherCode: z.string().trim().max(40).optional(),
  payMethod: z.enum(["cash", "wechat"]).default("cash"),
});

export const createBookingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  party: z.number().int().min(1).max(20),
  occasion: z.string().trim().max(40).optional(),
  dietary: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(["received", "preparing", "out-for-delivery", "ready-for-collection", "completed", "cancelled"]),
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
