import type { Order, OrderLine, Booking } from "@prisma/client";
import { SITE_URL } from "@/lib/site-url";
import { RESTAURANT } from "@/lib/data/site";
import type { SiteContent } from "@/lib/site-content";
import STRINGS from "@/lib/i18n/email-strings.json";

// Email content in English, Chinese, Vietnamese and Japanese. The wording lives in
// src/lib/i18n/email-strings.json (one place for the translator to review). Everything a customer
// or admin typed is HTML-escaped before it goes into an email.

type Business = SiteContent["business"];
export type EmailLocale = "en" | "zh" | "vi" | "ja";
export const asEmailLocale = (l: string | null | undefined): EmailLocale => (l === "zh" || l === "vi" || l === "ja" ? l : "en");

const INTL: Record<EmailLocale, string> = { en: "en-GB", zh: "zh-CN", vi: "vi-VN", ja: "ja-JP" };
const HTML_LANG: Record<EmailLocale, string> = { en: "en", zh: "zh-Hans", vi: "vi", ja: "ja" };

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `£${n.toFixed(2)}`;
const b = (s: string) => `<b>${s}</b>`;

type Key = keyof typeof STRINGS;
/** Translated, escaped sentence; {placeholders} are filled with already-escaped HTML values. */
function t(l: EmailLocale, key: Key, vars: Record<string, string | number> = {}): string {
  const entry = STRINGS[key] as Record<string, string>;
  const template = entry[l] || entry.en;
  return esc(template).replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
}

interface Built { subject: string; html: string; text: string }

/** Branded wrapper. `paras` are already-escaped HTML fragments. */
function layout(l: EmailLocale, biz: Business, heading: string, paras: string[], footer?: string): string {
  return `<!doctype html><html lang="${HTML_LANG[l]}"><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f1e7;font-family:Arial,Helvetica,'PingFang SC','Microsoft YaHei','Hiragino Sans',sans-serif;color:#1f1b16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1f1b16;color:#ecbb4e;padding:18px 24px;font-size:20px;font-weight:bold">${esc(RESTAURANT.name)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:22px">${heading}</h1>
${paras.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${p}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:16px 24px;background:#faf7f0;font-size:12px;color:#6b6257;line-height:1.5">
${esc(biz.address.line1)}, ${esc(biz.address.city)} ${esc(biz.address.postcode)} · ${esc(biz.phone)}<br>
${t(l, "common.allergy")}${footer ? `<br>${footer}` : ""}
</td></tr></table></td></tr></table></body></html>`;
}

const stripTags = (html: string) => html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function build(l: EmailLocale, biz: Business, subject: string, heading: string, paras: string[]): Built {
  const text = [stripTags(heading), ...paras.map(stripTags), `${RESTAURANT.name} · ${biz.address.line1}, ${biz.address.city} ${biz.address.postcode} · ${biz.phone}`].join("\n\n");
  return { subject: stripTags(subject), html: layout(l, biz, heading, paras), text };
}

const firstName = (name: string) => esc(name.split(" ")[0] || name);

/** "Sat 11 Oct, 19:00" in the customer's language, UK time. */
function dateTime(l: EmailLocale, d: Date): string {
  const date = d.toLocaleDateString(INTL[l], { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `${date} ${time}`;
}
/** A booking date ("2026-10-25") as "Sunday 25 October" in the customer's language. */
function niceDate(l: EmailLocale, dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(INTL[l], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ orders */

export type OrderEvent = "received" | "out-for-delivery" | "ready-for-collection" | "completed" | "cancelled";

/** `dishNames`: translated dish names from the site's translation cache (English if missing). */
export function orderEmail(event: OrderEvent, o: Order & { lines: OrderLine[] }, biz: Business, dishNames: Record<string, string> = {}): Built {
  const l = asEmailLocale(o.locale);
  const ref = b(esc(o.id));
  const plainRef = esc(o.id);
  const type = t(l, o.fulfilment === "delivery" ? "word.delivery" : "word.collection");
  const when = o.whenType === "scheduled" && o.scheduledAt ? t(l, "when.scheduled", { time: b(esc(dateTime(l, o.scheduledAt))) }) : t(l, "when.asap", { mins: o.etaMins });
  const pay = o.paymentMethod === "wechat"
    ? t(l, o.paymentStatus === "paid" ? "pay.wechatPaid" : "pay.wechatPending")
    : t(l, "pay.cash", { total: b(money(o.total)) });
  const address = o.fulfilment === "delivery" ? `${esc(o.address)}${o.postcode ? `, ${esc(o.postcode)}` : ""}` : `${esc(biz.address.line1)}, ${esc(biz.address.city)} ${esc(biz.address.postcode)}`;
  const lines = o.lines.map((ln) => `${ln.qty} × ${esc(dishNames[ln.name] ?? ln.name)}${ln.unitPrice === 0 ? ` (${t(l, "word.free")})` : ` - ${money(ln.unitPrice * ln.qty)}`}`).join("<br>");
  const phone = esc(biz.phone);

  switch (event) {
    case "received":
      return build(l, biz, t(l, "order.received.subject", { ref: plainRef }), t(l, "order.received.heading", { name: firstName(o.customerName) }), [
        t(l, "order.received.summary", { ref, type, when }),
        lines,
        `${o.discount > 0 ? t(l, "order.totalDiscount", { total: b(money(o.total)), discount: money(o.discount) }) : t(l, "order.total", { total: b(money(o.total)) })} ${pay}`,
        t(l, o.fulfilment === "delivery" ? "order.deliverTo" : "order.collectFrom", { address }),
        t(l, o.fulfilment === "delivery" ? "order.nextDelivery" : "order.nextCollection", { phone, ref }),
      ]);
    case "out-for-delivery":
      return build(l, biz, t(l, "order.onWay.subject", { ref: plainRef }), t(l, "order.onWay.heading"), [t(l, "order.onWay.body", { ref, address }), pay]);
    case "ready-for-collection":
      return build(l, biz, t(l, "order.ready.subject", { ref: plainRef }), t(l, "order.ready.heading"), [t(l, "order.ready.body", { ref, address }), pay]);
    case "completed":
      return build(l, biz, t(l, o.fulfilment === "delivery" ? "order.done.subjectDelivered" : "order.done.subjectCollected", { ref: plainRef }), t(l, "order.done.heading"), [
        t(l, "order.done.body", { ref }),
        ...(o.userId && o.pointsEarned > 0 ? [t(l, "order.done.points", { points: o.pointsEarned })] : []),
      ]);
    case "cancelled":
      return build(l, biz, t(l, "order.cancelled.subject", { ref: plainRef }), t(l, "order.cancelled.heading"), [
        o.cancelReason ? t(l, "order.cancelled.bodyReason", { ref, total: money(o.total), reason: esc(o.cancelReason) }) : t(l, "order.cancelled.body", { ref, total: money(o.total) }),
        t(l, o.paymentStatus === "paid" ? "order.cancelled.refund" : "order.cancelled.notCharged"),
        t(l, "common.questions", { phone }),
      ]);
  }
}

/* ------------------------------------------------------------------ bookings */

export type BookingEvent = "confirmed" | "waitlist" | "cancelled" | "reminder";

export function bookingEmail(event: BookingEvent, bk: Booking, biz: Business): Built {
  const l = asEmailLocale(bk.locale);
  const date = esc(niceDate(l, bk.date));
  const time = esc(bk.time);
  const what = t(l, bk.party === 1 ? "booking.what.one" : "booking.what.many", { party: bk.party, date: b(date), time: b(time) });
  const ref = b(esc(bk.id));
  const plainRef = esc(bk.id);
  const phone = esc(biz.phone);
  switch (event) {
    case "confirmed":
      return build(l, biz, t(l, "booking.confirmed.subject", { date, time }), t(l, "booking.confirmed.heading", { name: firstName(bk.name) }), [
        t(l, "booking.confirmed.body", { what, ref }),
        ...(bk.requiresCall ? [t(l, "booking.largeParty")] : []),
        t(l, "booking.change", { phone, ref: plainRef }),
      ]);
    case "waitlist":
      return build(l, biz, t(l, "booking.waitlist.subject", { date, time }), t(l, "booking.waitlist.heading"), [
        t(l, "booking.waitlist.body", { what, ref }), t(l, "booking.waitlist.note"), t(l, "booking.change", { phone, ref: plainRef }),
      ]);
    case "cancelled":
      return build(l, biz, t(l, "booking.cancelled.subject", { ref: plainRef }), t(l, "booking.cancelled.heading"), [
        t(l, "booking.cancelled.body", { what, ref }), t(l, "booking.cancelled.mistake", { phone }),
      ]);
    case "reminder":
      return build(l, biz, t(l, "booking.reminder.subject", { time }), t(l, "booking.reminder.heading"), [
        t(l, "booking.reminder.body", { what, ref }), t(l, "booking.reminder.cantMake", { phone }),
      ]);
  }
}

/* ------------------------------------------------------------------ accounts */

export function accountEmail(event: "deactivated" | "closed" | "reactivated", name: string, locale: string, biz: Business, deadline?: Date): Built {
  const l = asEmailLocale(locale);
  const n = firstName(name);
  if (event === "deactivated") {
    const when = deadline ? deadline.toLocaleDateString(INTL[l], { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) : "";
    return build(l, biz, t(l, "account.deactivated.subject"), t(l, "account.deactivated.heading"), [
      t(l, "account.deactivated.body1", { name: n }),
      t(l, "account.deactivated.body2", { deadline: b(esc(when)) }),
      t(l, "account.deactivated.body3"),
    ]);
  }
  if (event === "reactivated") return build(l, biz, t(l, "account.reactivated.subject"), t(l, "account.reactivated.heading"), [t(l, "account.reactivated.body", { name: n })]);
  return build(l, biz, t(l, "account.closed.subject"), t(l, "account.closed.heading"), [t(l, "account.closed.body1", { name: n }), t(l, "account.closed.body2")]);
}

/* ------------------------------------------------------------------ offers */

/** A promotional email written by the owner (already chosen in the customer's language). */
export function campaignEmail(subject: string, body: string, name: string, locale: string, unsubscribeUrl: string, biz: Business): Built {
  const l = asEmailLocale(locale);
  const paras = body.trim().split(/\n{2,}/).map((p) => esc(p).replace(/\n/g, "<br>"));
  const greeting = t(l, "campaign.greeting", { name: firstName(name) });
  const footer = `${t(l, "campaign.why")} <a href="${esc(unsubscribeUrl)}" style="color:#6b6257">${t(l, "campaign.unsubscribe")}</a>`;
  const html = layout(l, biz, esc(subject), [greeting, ...paras, `<a href="${esc(SITE_URL)}/menu" style="display:inline-block;background:#1f1b16;color:#ecbb4e;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">${t(l, "campaign.orderNow")}</a>`], footer);
  const text = [stripTags(greeting), "", body.trim(), "", `${stripTags(t(l, "campaign.orderNow"))}: ${SITE_URL}/menu`, "", `${stripTags(t(l, "campaign.unsubscribe"))}: ${unsubscribeUrl}`].join("\n");
  return { subject, html, text };
}
