"use client";

import type { PlacedOrder } from "@/lib/order";
import type { Booking, BookingStatus } from "@/lib/booking";
import type { OrderStatus } from "@/lib/data/site";
import type { SiteContent } from "@/lib/site-content";

export interface AdminCustomer {
  id: string; name: string; email: string; phone: string;
  points: number; createdAt: string; orders: number; spend: number;
}

interface RawLine { id: string; itemId: string; name: string; unitPrice: number; qty: number; modifiers: string }
interface RawOrder {
  id: string; createdAt: string; fulfilment: string; status: string;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  customerName: string; customerPhone: string; customerEmail: string | null; userId: string | null;
  address: string | null; postcode: string | null; notes: string | null; whenType: string; etaMins: number;
  paymentMethod?: string; paymentStatus?: string;
  lines: RawLine[];
}
interface RawBooking {
  id: string; createdAt: string; name: string; phone: string; email: string | null;
  date: string; time: string; party: number; status: string;
  tableId: string | null; occasion: string | null; dietary: string | null; notes: string | null;
}

function normOrder(o: RawOrder): PlacedOrder {
  return {
    id: o.id,
    createdAt: Date.parse(o.createdAt),
    fulfilment: o.fulfilment as PlacedOrder["fulfilment"],
    status: o.status as OrderStatus,
    customer: {
      name: o.customerName, phone: o.customerPhone,
      email: o.customerEmail ?? undefined, userId: o.userId ?? undefined,
      address: o.address ?? undefined, postcode: o.postcode ?? undefined, notes: o.notes ?? undefined,
    },
    lines: o.lines.map((l) => ({
      lineId: l.id, itemId: l.itemId, name: l.name, unitPrice: l.unitPrice, qty: l.qty,
      modifiers: safeJson(l.modifiers), image: "",
    })),
    subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total,
    when: o.whenType === "asap" ? "asap" : "scheduled", etaMins: o.etaMins,
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
  };
}
function safeJson(s: string): { groupId: string; optionId: string; label: string }[] {
  try { return JSON.parse(s); } catch { return []; }
}
function normBooking(b: RawBooking): Booking {
  return {
    id: b.id, createdAt: Date.parse(b.createdAt), name: b.name, phone: b.phone, email: b.email ?? undefined,
    date: b.date, time: b.time, party: b.party, status: b.status as BookingStatus,
    tableId: b.tableId ?? undefined, occasion: b.occasion ?? undefined, dietary: b.dietary ?? undefined, notes: b.notes ?? undefined,
  };
}

export async function fetchOrders(): Promise<PlacedOrder[]> {
  const res = await fetch("/api/admin/orders", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.orders as RawOrder[]).map(normOrder);
}
export async function patchOrderStatus(id: string, status: OrderStatus): Promise<PlacedOrder | null> {
  const res = await fetch(`/api/admin/orders/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  return normOrder((await res.json()).order);
}

export async function fetchBookings(): Promise<Booking[]> {
  const res = await fetch("/api/admin/bookings", { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.bookings as RawBooking[]).map(normBooking);
}
export async function patchBookingStatus(id: string, status: BookingStatus, tableId?: string): Promise<boolean> {
  const res = await fetch(`/api/admin/bookings/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, tableId }),
  });
  return res.ok;
}
export async function patchBooking(id: string, patch: Partial<Booking>): Promise<boolean> {
  const res = await fetch(`/api/admin/bookings/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return res.ok;
}

export async function fetchCustomers(): Promise<AdminCustomer[]> {
  const res = await fetch("/api/admin/customers", { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()).customers as AdminCustomer[];
}

export async function fetchSettings(): Promise<{ blackouts: string[]; disabledZones: string[] }> {
  const res = await fetch("/api/admin/settings", { cache: "no-store" });
  if (!res.ok) return { blackouts: [], disabledZones: [] };
  return res.json();
}
export async function saveSettings(patch: { blackouts?: string[]; disabledZones?: string[] }): Promise<{ blackouts: string[]; disabledZones: string[] }> {
  const res = await fetch("/api/admin/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return res.json();
}

/* ---- Editable config ---- */
export interface ReferralCfg { give: number; get: number; minSpend: number; maxPerUser: number }
export interface ZoneCfg { id: string; label: string; postcodes: string[]; fee: number; etaMins: number }
export interface OfferCfg { id: string; title: string; description: string; code?: string; badge?: string; terms: string; kind: string }
export interface WheelPrizeCfg { id: string; label: string; kind: string; weight: number; color: string }
export interface JobCfg { id: string; title: string; type: string; location: string; summary: string; description: string; active: boolean }
export interface DealCfg { active: boolean; title: string; description: string; itemId?: string; price?: number; badge: string }
export interface AdminConfig {
  referral: ReferralCfg; zones: ZoneCfg[]; offers: OfferCfg[];
  wheelPrizes: WheelPrizeCfg[]; menuOverrides: Record<string, MenuOverrideCfg>;
  careers: JobCfg[]; deal: DealCfg; maxMiles: number; site: SiteContent; siteVersion: string;
}
export interface MenuOverrideCfg {
  name?: string; price?: number; soldOut?: boolean;
  image?: string; category?: string; leadTimeHours?: number; description?: string; aiNotes?: string;
}

export async function uploadImage(file: File): Promise<{ ok: boolean; url?: string; error?: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.url) return { ok: true, url: data.url };
  return { ok: false, error: data.error ?? "Upload failed." };
}

export async function fetchConfig(): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config", { cache: "no-store" });
  return res.json();
}
export async function saveConfig(patch: Partial<AdminConfig>): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return res.json();
}

export async function saveSite(site: SiteContent, baseVersion: string): Promise<
  { ok: true; site: SiteContent; version: string } | { ok: false; error: string; conflict?: boolean }
> {
  const res = await fetch("/api/admin/config", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site, siteBaseVersion: baseVersion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Could not save.", conflict: res.status === 409 };
  return { ok: true, site: data.site as SiteContent, version: data.siteVersion as string };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: (await res.json().catch(() => ({}))).error };
}

/* ---- Staff ---- */
export interface StaffMember { id: string; name: string; email: string; role: string; permissions: string[]; createdAt: string }
export async function fetchStaff(): Promise<StaffMember[]> {
  const res = await fetch("/api/admin/staff", { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()).staff;
}
export async function createStaff(data: { name: string; email: string; password: string; role: string; permissions: string[] }): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/staff", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: (await res.json().catch(() => ({}))).error };
}
export async function updateStaff(id: string, patch: { role?: string; permissions?: string[] }): Promise<boolean> {
  const res = await fetch(`/api/admin/staff/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return res.ok;
}
export async function deleteStaff(id: string): Promise<boolean> {
  const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
  return res.ok;
}
