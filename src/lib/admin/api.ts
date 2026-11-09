"use client";

import type { PlacedOrder } from "@/lib/order";
import type { Booking, BookingStatus } from "@/lib/booking";
import type { Table } from "@/lib/data/tables";
import type { OrderStatus } from "@/lib/data/site";
import type { SiteContent } from "@/lib/site-content";
import type { Allergen, DietTag, MenuItem, MenuCategoryCfg, ModifierGroup } from "@/lib/data/menu";

export interface AdminCustomer {
  id: string; name: string; email: string; phone: string;
  points: number; createdAt: string; orders: number; spend: number;
  status?: string; marketingOptIn?: boolean;
  balanceStatus?: string; balance?: number; // prepaid balance (none | offered | active | declined)
}

interface RawLine { id: string; itemId: string; name: string; unitPrice: number; qty: number; modifiers: string }
interface RawOrder {
  id: string; createdAt: string; fulfilment: string; status: string;
  subtotal: number; deliveryFee: number; discount: number; total: number;
  customerName: string; customerPhone: string; customerEmail: string | null; userId: string | null;
  address: string | null; postcode: string | null; notes: string | null; whenType: string; etaMins: number;
  scheduledTime?: string | null; voucherCode?: string | null; handoverCode?: string | null;
  balancePaid?: number;
  paymentMethod?: string; paymentStatus?: string;
  printStatus?: string; printError?: string | null; flags?: string[]; cancelReason?: string | null;
  cancelKind?: string | null; cancelledAt?: string | null;
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
    scheduledTime: o.scheduledTime ?? undefined, voucherCode: o.voucherCode ?? undefined, handoverCode: o.handoverCode ?? undefined, balancePaid: o.balancePaid ?? 0,
    paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    printStatus: o.printStatus, printError: o.printError ?? undefined, flags: o.flags ?? [], cancelReason: o.cancelReason ?? undefined,
    cancelKind: o.cancelKind ?? undefined, cancelledAt: o.cancelledAt ? Date.parse(o.cancelledAt) : undefined,
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
export type CancelKind = "customer" | "no-show" | "staff";
export async function patchOrderStatus(id: string, status: OrderStatus, reason?: string, cancelKind?: CancelKind): Promise<{ order: PlacedOrder | null; error?: string }> {
  const res = await fetch(`/api/admin/orders/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason, cancelKind }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { order: null, error: data.error ?? "Could not update the order." };
  return { order: data.order ? normOrder(data.order) : null };
}
/** Owner: remove test orders for good (needs the owner's password). */
export async function deleteTestOrders(ids: string[], confirmPassword: string): Promise<{ deleted: string[]; refused: { id: string; error: string }[]; referrerRewardKept?: boolean } | { error: string }> {
  const res = await fetch("/api/admin/orders/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, confirmPassword }) }).catch(() => null);
  const data = await res?.json().catch(() => ({})) ?? {};
  if (!res?.ok) return { error: data.error ?? "Could not delete. Check your connection." };
  return data;
}
export async function setOrdersPaused(paused: boolean): Promise<boolean | null> {
  const res = await fetch("/api/admin/orders/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  if (!res.ok) return null;
  return !!(await res.json()).paused;
}

/** Upcoming bookings (from yesterday on), or the last 60 days with past=true. */
export async function fetchBookings(past = false, q = ""): Promise<Booking[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q); else if (past) params.set("past", "1");
  const res = await fetch(`/api/admin/bookings${params.size ? `?${params}` : ""}`, { cache: "no-store" });
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

export async function fetchCustomers(q = "", page = 0, optedIn = false): Promise<{ customers: AdminCustomer[]; total: number; page: number; pageSize: number }> {
  const res = await fetch(`/api/admin/customers?${new URLSearchParams({ q, page: String(page), ...(optedIn ? { optedIn: "1" } : {}) })}`, { cache: "no-store" });
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
export interface MenuAdminData { menuOverrides: Record<string, MenuOverrideCfg>; categories: MenuCategoryCfg[]; customDishes: MenuItem[]; menuVersion: string; canEdit: boolean }
export async function fetchMenuAvailability(): Promise<MenuAdminData | null> {
  const res = await fetch("/api/admin/menu", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export async function setSoldOut(itemId: string, soldOut: boolean): Promise<Pick<MenuAdminData, "menuOverrides" | "customDishes" | "menuVersion"> | null> {
  const res = await fetch("/api/admin/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, soldOut }) });
  return res.ok ? res.json() : null;
}

/* ---- Owner tools ---- */
export interface Diagnostics {
  detectedIp: string; clientIpHeaderSetting: string | null;
  headers: Record<string, string | null>;
  integrations: Record<string, string | boolean | null>;
  database?: { rowLevelSecurityOff: string[] | string };
}
/**
 * Can a visitor choose their own IP? Sends the check again with made-up address headers. Safe: it only
 * reads the owner's own diagnostics. "protected" = refused (403) or the made-up address was ignored.
 */
export async function testFakeAddress(): Promise<{ header: string; result: "protected" | "TRUSTED" | "error"; detail: string }[]> {
  const FAKE = "198.51.100.7"; // documentation-only address, never a real visitor
  const out: { header: string; result: "protected" | "TRUSTED" | "error"; detail: string }[] = [];
  // First a normal check: the owner must be signed in, or the site's own "forbidden" would look like a refusal.
  const base = await fetchDiagnostics();
  if (!base) return [{ header: "-", result: "error", detail: "sign in as the owner, then run the test again" }];
  // Also test the header named in CLIENT_IP_HEADER, if it's set to one outside the usual three.
  const headers = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"];
  const own = base.clientIpHeaderSetting?.toLowerCase();
  if (own && !headers.includes(own)) headers.push(own);
  for (const header of headers) {
    const res = await fetch("/api/admin/diagnostics", { cache: "no-store", headers: { [header]: FAKE } }).catch(() => null);
    if (!res) { out.push({ header, result: "error", detail: "no answer" }); continue; }
    if (res.status === 403 || res.status === 400) {
      // The site's own refusal is JSON {"error":"forbidden"} (session problem), not the hosting edge refusing.
      const body = await res.text().catch(() => "");
      const ours = /"error"\s*:\s*"forbidden"/.test(body);
      out.push(ours ? { header, result: "error", detail: "the site refused the test (sign in again)" } : { header, result: "protected", detail: `refused by the host (${res.status})` });
      continue;
    }
    const d = await res.json().catch(() => null) as Diagnostics | null;
    if (!d) { out.push({ header, result: "error", detail: `status ${res.status}` }); continue; }
    out.push(d.detectedIp === FAKE ? { header, result: "TRUSTED", detail: "the made-up address was used" } : { header, result: "protected", detail: `ignored, saw ${d.detectedIp}` });
  }
  return out;
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
export interface ReferralCfg { enabled: boolean; give: number; get: number; minSpend: number; maxPerUser: number }
export interface ZoneCfg { id: string; label: string; postcodes: string[]; fee: number; etaMins: number }
export interface OfferCfg {
  id: string; title: string; description: string; code?: string; badge?: string; terms: string; kind: string;
  pctOff?: number; amountOff?: number; freeItemId?: string; minSpend?: number; firstOrderOnly?: boolean; oncePerCustomer?: boolean; hidden?: boolean;
}
export interface WheelPrizeCfg { id: string; label: string; kind: string; weight: number; color: string; amount?: number; freeItemId?: string }
export interface JobCfg { id: string; title: string; type: string; location: string; summary: string; description: string; active: boolean }
export interface DealCfg { active: boolean; title: string; description: string; itemId?: string; price?: number; badge: string }
// Delivery prices: minimum food for delivery, and free delivery from this food total (null = never free).
export interface DeliveryCfg { minOrder: number; freeDeliveryOver: number | null }
// Loyalty points: earn rate, what they're worth, voucher length, sign-up bonus.
export interface LoyaltyCfg { pointsPerPound: number; redeemPoints: number; redeemValue: number; voucherDays: number; welcomePoints: number }
// "Order direct on our website and save 10%" (null = deleted).
export interface OnlineDiscountCfg {
  enabled: boolean; pctOff: number; appliesTo: "all" | "delivery" | "collection"; minSpend: number;
  withCodes: "best" | "stack" | "stack-except-first-order"; pauseFirstOrderCodes: boolean; message: string;
}
export interface AdminConfig {
  referral: ReferralCfg; zones: ZoneCfg[]; offers: OfferCfg[];
  wheelPrizes: WheelPrizeCfg[]; menuOverrides: Record<string, MenuOverrideCfg>;
  careers: JobCfg[]; deal: DealCfg; maxMiles: number; site: SiteContent; siteVersion: string;
  promotions: PromotionsCfg; delivery: DeliveryCfg;
  categories: MenuCategoryCfg[]; customDishes: MenuItem[]; menuVersion: string;
  onlineDiscount: OnlineDiscountCfg | null;
  loyalty: LoyaltyCfg;
}
export type PromoKey = "offers" | "wheel" | "referral";
export interface PromoCfg { enabled: boolean; message: string; graceDays: number; pausedAt?: string | null }
export type PromotionsCfg = Record<PromoKey, PromoCfg>;
export interface MenuOverrideCfg {
  name?: string; price?: number; soldOut?: boolean;
  image?: string; images?: string[]; category?: string; leadTimeHours?: number; description?: string; aiNotes?: string;
  hidden?: boolean; modifiers?: ModifierGroup[];
  allergens?: Allergen[]; allergensChecked?: boolean; tags?: DietTag[]; spiceLevel?: 0 | 1 | 2 | 3; phoneOrder?: boolean;
}

/**
 * Shrink a photo in the browser before it's uploaded: at most 1200px on the long side, saved as WebP
 * (a phone photo goes from ~4-6MB to ~100-250KB). Customers then download small images whether or
 * not Cloudinary is set up. Falls back to the original if the browser can't do it.
 */
async function compressImage(file: File, maxSide = 1200, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadImage(original: File, kind: "menu" | "campaign" = "menu"): Promise<{ ok: boolean; url?: string; error?: string }> {
  const file = await compressImage(original);
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.url) return { ok: true, url: data.url };
  return { ok: false, error: data.error ?? "Upload failed." };
}

/** A PDF (menu, flyer) to link from a promotional email. Not compressed. */
export async function uploadCampaignFile(file: File): Promise<{ ok: boolean; url?: string; error?: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "campaign-file");
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.url) return { ok: true, url: data.url };
  return { ok: false, error: data.error ?? "Upload failed." };
}

/** The floor plan tables (any staff with Bookings/Floor access can read; only the owner can save). */
export async function fetchFloorTables(): Promise<{ tables: Table[]; canEdit: boolean } | null> {
  const res = await fetch("/api/admin/floor", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export async function saveFloorTables(tables: Table[]): Promise<{ ok: true; tables: Table[] } | { ok: false; error: string }> {
  const res = await fetch("/api/admin/floor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tables }) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, tables: data.tables } : { ok: false, error: data.error ?? "Could not save the floor plan." };
}

export async function fetchConfig(): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config", { cache: "no-store" });
  return res.json();
}
/** Save part of the config. Throws an Error with the server's readable message if it was rejected. */
/** Thrown when a save is refused because the data changed elsewhere (409): reload and try again. */
export class ConflictError extends Error {}

export async function saveConfig(patch: Partial<AdminConfig> & { menuBaseVersion?: string }): Promise<AdminConfig> {
  const res = await fetch("/api/admin/config", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.conflict) throw new ConflictError(data.error ?? "Changed elsewhere. Reload and try again.");
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
export async function createStaff(data: { name: string; email: string; password: string; role: string; permissions: string[]; confirmPassword: string }): Promise<{ ok: boolean; error?: string }> {
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
export interface PrintResult { ok: boolean; provider: "printnode" | null; message: string; detail?: string; online?: { ok: boolean; message: string; raw: string } }
export async function fetchPrinterInfo(): Promise<{ provider: "printnode" | null; printerSn: string | null }> {
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

/* ---- Promotional emails (owner only) ---- */
export interface CampaignRow { id: string; subject: string; audience: string; status: string; total: number; sent: number; failed: number; createdAt: string; finishedAt: string | null }
export async function fetchCampaigns(): Promise<{ campaigns: CampaignRow[]; optedIn: number; allowanceToday: number; dailyLimit: number; configured: boolean } | null> {
  const res = await fetch("/api/admin/campaigns", { cache: "no-store" });
  return res.ok ? res.json() : null;
}
async function jsonOrError(res: Response): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, ...data } : { ok: false, error: data.error ?? "Something went wrong." };
}
export interface CampaignMediaInput { imageUrl?: string | null; fileUrl?: string | null; fileName?: string | null }
export async function createCampaign(input: { subject: string; body: string; translations?: Record<string, { subject: string; body: string }>; audience: "all" | "selected"; userIds?: string[] } & CampaignMediaInput) {
  return jsonOrError(await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
}
export async function translateCampaign(input: { locale: string; subject: string; body: string }) {
  return jsonOrError(await fetch("/api/admin/campaigns/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
}
export async function sendCampaignTest(input: { subject: string; body: string; locale?: string } & CampaignMediaInput) {
  return jsonOrError(await fetch("/api/admin/campaigns/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
}
export async function cancelCampaign(id: string) {
  return jsonOrError(await fetch(`/api/admin/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" }));
}
export async function unblockEmail(email: string) {
  return jsonOrError(await fetch("/api/admin/blocked-emails", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
}

/* ---- Cancellations ---- */
export interface CancelPolicy { customerCancelMinutes: number; scheduledCutoffMinutes: number; windowDays: number; flagAt: number; restrictAt: number; restrictAction: "block-cash-delivery" | "flag-only" }
/* ---- Tablet (USB) printer queue ---- */
export interface TabletJob { orderId: string; kind: "order" | "cancel"; bytes: string }
export async function claimPrintJobs(receipt = true): Promise<TabletJob[]> {
  const res = await fetch("/api/admin/print-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipt }) }).catch(() => null);
  if (!res?.ok) return [];
  return (await res.json()).jobs ?? [];
}
export async function reportPrintFailure(orderId: string, kind: "order" | "cancel", error: string) {
  await fetch("/api/admin/print-queue/failed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, kind, error: error.slice(0, 200) }) }).catch(() => {});
}
/** ESC/POS bytes (base64) for a test ticket, or for reprinting an order / its STOP ticket on the tablet. */
export async function fetchTicketBytes(q: { test: true; receipt?: boolean } | { orderId: string; kind: "order" | "cancel" | "receipt" }): Promise<string | null> {
  const qs = "test" in q ? `test=1${q.receipt === false ? "&receipt=0" : ""}` : `orderId=${encodeURIComponent(q.orderId)}&kind=${q.kind}`;
  const res = await fetch(`/api/admin/print-queue/ticket?${qs}`, { cache: "no-store" }).catch(() => null);
  return res?.ok ? (await res.json()).bytes ?? null : null;
}

export async function fetchCancelCount(orderId: string): Promise<{ count: number; policy: CancelPolicy } | null> {
  const res = await fetch(`/api/admin/cancellations?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}
export async function resetCancelCount(orderId: string) {
  return jsonOrError(await fetch("/api/admin/cancellations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) }));
}
export async function fetchCancelPolicy(): Promise<CancelPolicy | null> {
  const res = await fetch("/api/admin/cancel-policy", { cache: "no-store" });
  return res.ok ? (await res.json()).policy : null;
}
export async function saveCancelPolicy(p: CancelPolicy) {
  return jsonOrError(await fetch("/api/admin/cancel-policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }));
}

/* ---- Referrals ---- */
export interface ReferralRow {
  id: string; code: string; status: "pending" | "rewarded" | "void"; orderId: string | null; voidReason: string | null;
  createdAt: string; rewardedAt: string | null;
  referrer: { name: string; email: string }; referee: { name: string; email: string };
}
export async function fetchReferrals(): Promise<ReferralRow[]> {
  const res = await fetch("/api/admin/referrals", { cache: "no-store" });
  return res.ok ? (await res.json()).referrals : [];
}
export async function voidReferralApi(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "void", reason }) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: d.error ?? "Couldn't void it." };
}
