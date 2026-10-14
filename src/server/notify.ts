import { prisma } from "@/server/db";
import { getSiteContent } from "@/server/site-content";
import { sendTransactional } from "@/server/email";
import { orderEmail, bookingEmail, type OrderEvent, type BookingEvent } from "@/server/email-templates";
import { log, errInfo } from "@/server/log";
import { cachedTranslations } from "@/server/translate";
import { trackUrl } from "@/server/cancellations";

// Customer emails for order and booking events: order received (with a live tracking link),
// on its way / ready to collect (each with "enjoy your meal"), and cancelled. Fire-and-forget: callers don't wait, and a failed
// email never affects the order. Each event is sent at most once (EmailLog key).

const ORDER_EVENTS = new Set<string>(["received", "out-for-delivery", "ready-for-collection", "cancelled"]);

export function notifyOrder(orderId: string, event: string): void {
  if (!ORDER_EVENTS.has(event)) return; // e.g. "preparing" doesn't email
  void (async () => {
    try {
      const o = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!o?.customerEmail) return;
      const { business } = await getSiteContent();
      // Dish names in the customer's language, from the site's translation cache (English if not cached).
      const dishNames = o.locale !== "en" ? await cachedTranslations(o.lines.map((l) => l.name), o.locale) : {};
      const m = orderEmail(event as OrderEvent, o, business, dishNames, trackUrl(o.id));
      await sendTransactional(`order-${event}`, `order:${o.id}:${event}`, { to: { email: o.customerEmail, name: o.customerName }, ...m });
    } catch (e) {
      log.error("notify_order_failed", { orderId, event, ...errInfo(e) });
    }
  })();
}

export function notifyBooking(bookingId: string, event: BookingEvent): void {
  void (async () => {
    try {
      const bk = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!bk?.email) return;
      const { business } = await getSiteContent();
      const m = bookingEmail(event, bk, business);
      await sendTransactional(`booking-${event}`, `booking:${bk.id}:${event}`, { to: { email: bk.email, name: bk.name }, ...m });
    } catch (e) {
      log.error("notify_booking_failed", { bookingId, event, ...errInfo(e) });
    }
  })();
}
