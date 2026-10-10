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
  scheduledTime?: string | null; voucherCode?: string | null;
  paymentMethod?: string; paymentStatus?: string;
  printStatus?: string; printError?: string | null; flags?: string[]; cancelReason?: string | null;
  lines: RawLine[];
}
interface RawBooking {
  id: string; createdAt: string; name: string; phone: string; email: string | null;
  date: string; time: string; party: number; status: string;
  tableId: string | null; occasion: string | null; dietary: string | null; notes: string | null;
  requiresCall?: boolean;
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
    scheduledTime: o.scheduledTime ?? undefined, voucherCode: o.voucherCode ?? undefined,
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    printStatus: o.printStatus, printError: o.printError ?? undefined, flags: o.flags ?? [], cancelReason: o.cancelReason ?? undefined,
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
    requiresCall: b.requiresCall ?? false,
  };
}

/** The live order queue (all unfinished orders + recent ones) and whether online ordering is paused. */
export async function fetchOrdersFeed(opts: { days?: number; q?: string } = {}): Promise<{ orders: PlacedOrder[]; paused: boolean } | null> {
  const qs = new URLSearchParams();
  if (opts.days) qs.set("days", String(opts.days));
  if (opts.q) qs.set("q", opts.q);
  const res = await fetch(`/api/admin/orders?${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return { orders: (data.orders as RawOrder[]).map(normOrder), paused: !!data.paused };
}
export async function fetchOrders(): Promise<PlacedOrder[]> {
  return (await fetchOrdersFeed())?.orders ?? [];
}
export async function patchOrderStatus(id: string, status: OrderStatus, reason?: string): Promise<{ order: PlacedOrder | null; error?: string }> {
  const res = await fetch(`/api/admin/orders/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { order: null, error: data.error ?? "Could not update the order." };
  return { order: data.order ? normOrder(data.order) : null };
}
export async function setOrdersPaused(paused: boolean): Promise<boolean | null> {
  const res = await fetch("/api/admin/orders/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  if (!res.ok) return null;
  return !!(await res.json()).paused;
}

/** Upcoming bookings (from yesterday on), or the last 60 days with past=true. */
export async function fetchBookings(past = false): Promise<Booking[]> {
  const res = await fetch(`/api/admin/bookings${past ? "?past=1" : ""}`, { cache: "no-store" });
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

export async function fetchCustomers(q = "", page = 0): Promise<{ customers: AdminCustomer[]; total: number; page: number; pageSize: number }> {
  const res = await fetch(`/api/admin/customers?${new URLSearchParams({ q, page: String(page) })}`, { cache: "no-store" });
  if (!res.ok) return { customers: [], total: 0, page: 0, pageSize: 50 };
  return res.json();
}

/* ---- Dashboard & analytics (computed on the server) ---- */
export interface Stats {
  kpis: { revenue: number; orders: number; aov: number; repeatPct: number; covers: number; noShowPct: number | null; voucherRedemptionPct: number; abandonPct: number | null; cancelled: number };
  series: { day: string; orders: number; revenue: number }[];
  dishes: { name: string; qty: number }[];
  split: { name: string; value: number }[];
  recentOrders: { id: string; name: string; fulfilment: string; items: number; status: string; total: number }[] | null;
  todaysBookings: { id: string; time: string; name: string; party: number; occasion: string | null; status: string }[] | null;
  menuCount: number;
}
export async function fetchStats(): Promise<Stats | null> {
  const res = await fetch("/api/admin/stats", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export async function fetchAnalytics(days = 14): Promise<{ days: number; counts: Record<string, number>; recent: { name: string; createdAt: string }[] } | null> {
  const res = await fetch(`/api/admin/analytics?days=${days}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

/* ---- Menu availability (staff with Menu access) ---- */
export async function fetchMenuAvailability(): Promise<{ menuOverrides: Record<string, MenuOverrideCfg>; canEdit: boolean } | null> {
  const res = await fetch("/api/admin/menu", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export async function setSoldOut(itemId: string, soldOut: boolean): Promise<Record<string, MenuOverrideCfg> | null> {
  const res = await fetch("/api/admin/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, soldOut }) });
  return res.ok ? (await res.json()).menuOverrides : null;
}

/* ---- Owner tools ---- */
export interface Diagnostics {
  detectedIp: string; clientIpHeaderSetting: string | null;
  headers: Record<string, string | null>;
  integrations: Record<string, string | boolean | null>;
}
export async function fetchDiagnostics(): Promise<Diagnostics | null> {
  const res = await fetch("/api/admin/diagnostics", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export interface AuditEntry { id: string; actorEmail: string | null; action: string; entity: string; entityId: string | null; detail: string | null; ip: string | null; createdAt: string }
export async function fetchAudit(entityId?: string): Promise<AuditEntry[]> {
  const res = await fetch(`/api/admin/audit${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ""}`, { cache: "no-store" });
  return res.ok ? (await res.json()).logs : [];
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save.");
  return data;
}

/* ---- Editable config ---- */
export interface ReferralCfg { give: number; get: number; minSpend: number; maxPerUser: number }
export interface ZoneCfg { id: string; label: string; postcodes: string[]; fee: number; etaMins: number }
export interface OfferCfg { id: string; title: string; description: string; code?: string; badge?: string; terms: string; kind: string }
export interface WheelPrizeCfg { id: string; label: string; kind: string; weight: number; color: string; amount?: number }
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
/** Save part of the config. Throws an Error with the server's readable message if it was rejected. */
export async function saveConfig(patch: Partial<AdminConfig>): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save.");
  return data;
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
export async function updateStaff(id: string, patch: { role?: string; permissions?: string[]; confirmPassword?: string; newPassword?: string }): Promise<{ ok: boolean; error?: string; needsPassword?: boolean }> {
  const res = await fetch(`/api/admin/staff/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: data.error, needsPassword: !!data.needsPassword };
}
export async function deleteStaff(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
  if (res.ok) return { ok: true };
  return { ok: false, error: (await res.json().catch(() => ({}))).error };
}

/* ---- Kitchen printer ---- */
export interface PrintResult { ok: boolean; provider: "sunmi" | "printnode" | null; message: string; detail?: string; online?: { ok: boolean; message: string; raw: string } }
export async function fetchPrinterInfo(): Promise<{ provider: "sunmi" | "printnode" | null; printerSn: string | null }> {
  const res = await fetch("/api/admin/print-test", { cache: "no-store" });
  if (!res.ok) return { provider: null, printerSn: null };
  return res.json();
}
export async function sendTestPrint(): Promise<PrintResult> {
  const res = await fetch("/api/admin/print-test", { method: "POST" });
  return res.json().catch(() => ({ ok: false, provider: null, message: "Could not reach the server." }));
}
export async function reprintOrder(id: string): Promise<PrintResult> {
  const res = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/print`, { method: "POST" });
  return res.json().catch(() => ({ ok: false, provider: null, message: "Could not reach the server." }));
}
