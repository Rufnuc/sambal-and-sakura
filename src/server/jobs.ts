import { prisma } from "@/server/db";
import { printNewOrder } from "@/server/print";
import { looksPersonal } from "@/server/translate";
import { log, errInfo, alertOwner } from "@/server/log";
import { orderActivityRecently } from "@/server/activity";
import { closeExpiredDeactivations } from "@/server/accounts";
import { processCampaigns } from "@/server/campaigns";
import { notifyBooking } from "@/server/notify";
import { ukParts, addDays } from "@/server/order-time";
import { emailConfigured } from "@/server/email";

// Background jobs, run inside the web server process (one instance on Render, so no queue needed).
//  - every minute, but only within 3 hours of order activity (so a quiet site never wakes the
//    database): retry failed kitchen prints; alert the owner about orders nobody has picked up
//  - every 6 hours: delete expired sessions / rate-limit rows / old analytics events
//  - daily: remove personal details from old orders and bookings (data retention); close accounts
//    deactivated more than 14 days ago; at 10:00 UK, email tomorrow's bookings a reminder
//  - every minute while a promotion is queued: send the next batch of promotional emails

const MINUTE = 60_000;
const MAX_PRINT_ATTEMPTS = 5;
const ORDER_PII_DAYS = Number(process.env.ORDER_PII_RETENTION_DAYS) || 730;   // 2 years
const BOOKING_PII_DAYS = Number(process.env.BOOKING_PII_RETENTION_DAYS) || 365;
const EVENT_DAYS = 90;

async function retryPrints() {
  const now = Date.now();
  const due = await prisma.order.findMany({
    where: {
      printAttempts: { lt: MAX_PRINT_ATTEMPTS },
      createdAt: { gt: new Date(now - 3 * 60 * MINUTE) },
      status: { notIn: ["cancelled", "completed"] },
      OR: [{ paymentMethod: "cash" }, { paymentStatus: "paid" }],
      AND: [{ OR: [{ printStatus: "failed" }, { printStatus: "pending", createdAt: { lt: new Date(now - 90_000) } }] }],
    },
    select: { id: true },
    take: 20,
  });
  for (const o of due) await printNewOrder(o.id);
}

async function unacknowledgedOrders() {
  const now = Date.now();
  const stuck = await prisma.order.findMany({
    where: {
      status: "received",
      createdAt: { gt: new Date(now - 6 * 60 * MINUTE) },
      OR: [{ paymentMethod: "cash" }, { paymentStatus: "paid" }],
    },
    select: { id: true, createdAt: true, whenType: true, scheduledAt: true, scheduledTime: true, total: true },
  });
  for (const o of stuck) {
    const late = o.whenType === "scheduled" && o.scheduledAt
      ? o.scheduledAt.getTime() - now < 20 * MINUTE   // scheduled order due within 20 min, still not started
      : now - o.createdAt.getTime() > 5 * MINUTE;      // ASAP order waiting over 5 min
    if (late) {
      void alertOwner(`unacked:${o.id}`, `Order ${o.id} (£${o.total.toFixed(2)}${o.scheduledTime ? ", for " + o.scheduledTime : ""}) hasn't been started. Check the Orders screen and the printer.`);
    }
  }
}

async function cleanup() {
  const now = new Date();
  const [sessions, limits, events] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.event.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - EVENT_DAYS * 86400000) } } }),
  ]);
  log.info("cleanup", { sessions: sessions.count, rateLimits: limits.count, events: events.count });
}

async function retention() {
  const orderCutoff = new Date(Date.now() - ORDER_PII_DAYS * 86400000);
  const bookingCutoff = new Date(Date.now() - BOOKING_PII_DAYS * 86400000).toISOString().slice(0, 10);
  const [orders, bookings] = await Promise.all([
    // Totals and items stay (the restaurant's accounts); the person's details go.
    prisma.order.updateMany({
      where: { createdAt: { lt: orderCutoff }, NOT: { customerName: "Removed" } },
      data: { customerName: "Removed", customerPhone: "", customerEmail: null, address: null, notes: null },
    }),
    prisma.booking.updateMany({
      where: { date: { lt: bookingCutoff }, NOT: { name: "Removed" } },
      data: { name: "Removed", phone: "", email: null, notes: null, dietary: null },
    }),
  ]);
  if (orders.count || bookings.count) log.info("retention", { orders: orders.count, bookings: bookings.count });
}

/** One-off: remove any personal data that reached the shared translation cache before the filter existed. */
async function purgePersonalTranslations() {
  let removed = 0;
  for (let skip = 0; skip < 100_000; skip += 2000) {
    const rows = await prisma.translation.findMany({ select: { id: true, source: true }, skip, take: 2000, orderBy: { id: "asc" } });
    const bad = rows.filter((r) => looksPersonal(r.source)).map((r) => r.id);
    if (bad.length) { await prisma.translation.deleteMany({ where: { id: { in: bad } } }); removed += bad.length; skip -= bad.length; }
    if (rows.length < 2000) break;
  }
  if (removed) log.info("translation_cache_purged", { removed });
}

/** Once a day from 10:00 UK: remind guests booked for tomorrow (one email each). */
let lastReminderDay = "";
async function bookingReminders() {
  if (!emailConfigured()) return;
  const now = ukParts(new Date());
  if (now.minutes < 10 * 60 || lastReminderDay === now.dateKey) return; // only checks memory until it's time
  lastReminderDay = now.dateKey;
  const due = await prisma.booking.findMany({
    where: { date: addDays(now.dateKey, 1), status: "upcoming", reminderSentAt: null, email: { not: null } },
    select: { id: true },
  });
  if (due.length) await prisma.booking.updateMany({ where: { id: { in: due.map((b) => b.id) } }, data: { reminderSentAt: new Date() } });
  for (const b of due) notifyBooking(b.id, "reminder");
  if (due.length) log.info("booking_reminders", { count: due.length });
}

function every(ms: number, name: string, fn: () => Promise<void>) {
  let running = false;
  const run = async () => {
    if (running) return; // never overlap a slow run
    running = true;
    try { await fn(); } catch (e) { log.error("job_failed", { job: name, ...errInfo(e) }); } finally { running = false; }
  };
  setTimeout(run, 15_000); // let the server finish starting first
  setInterval(run, ms).unref();
}

export function startJobs() {
  const g = globalThis as unknown as { __ssJobs?: boolean };
  if (g.__ssJobs) return; // dev hot-reload / multiple imports: start once
  g.__ssJobs = true;
  every(MINUTE, "retry_prints", async () => { if (orderActivityRecently()) await retryPrints(); });
  every(MINUTE, "unacknowledged_orders", async () => { if (orderActivityRecently()) await unacknowledgedOrders(); });
  every(6 * 60 * MINUTE, "cleanup", cleanup);
  every(24 * 60 * MINUTE, "retention", retention);
  every(24 * 60 * MINUTE, "close_deactivated", async () => { const n = await closeExpiredDeactivations(); if (n) log.info("accounts_closed", { count: n }); });
  every(10 * MINUTE, "booking_reminders", bookingReminders);
  every(MINUTE, "campaigns", processCampaigns); // touches the DB only while a promotion is queued
  setTimeout(() => void purgePersonalTranslations().catch((e) => log.error("job_failed", { job: "purge_translations", ...errInfo(e) })), 30_000);
  log.info("jobs_started", {});
}
