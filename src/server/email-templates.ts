import type { Order, OrderLine, Booking } from "@prisma/client";
import { SITE_URL } from "@/lib/site-url";
import { RESTAURANT } from "@/lib/data/site";
import type { SiteContent } from "@/lib/site-content";
import STRINGS from "@/lib/i18n/email-strings.json";
import { gbpShort } from "@/lib/format";

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
${paras.map((p) => (p.startsWith("<table") ? `<div style="margin:0 0 14px">${p}</div>` : `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${p}</p>`)).join("\n")}
</td></tr>
<tr><td style="padding:16px 24px;background:#faf7f0;font-size:12px;color:#6b6257;line-height:1.5">
${esc(biz.address.line1)}, ${esc(biz.address.city)} ${esc(biz.address.postcode)} · ${esc(biz.phone)}<br>
${t(l, "common.allergy")}${footer ? `<br>${footer}` : ""}
</td></tr></table></td></tr></table></body></html>`;
}

// <!--notext-->...<!--/notext--> marks HTML-only decoration (e.g. dish pictures) left out of the plain-text copy.
const stripTags = (html: string) => html.replace(/<!--notext-->[\s\S]*?<!--\/notext-->/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<\/tr>/g, "\n").replace(/<\/td>/g, " ").replace(/<[^>]+>/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n+$/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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

export type OrderEvent = "received" | "out-for-delivery" | "ready-for-collection" | "cancelled";

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#1f1b16;color:#ecbb4e;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">${label}</a>`;

/**
 * `dishNames`: translated dish names from the site's translation cache (English if missing).
 * `trackUrl`: the customer's private live-tracking page for this order.
 */
// A small square for each dish: its menu photo (shrunk by Cloudinary), or a gold tile with the dish's
// initials when there's no photo yet. Built from table cells, so it still shows with images blocked.
const THUMB = 48;
function emailThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url);
  if (m) return `${m[1]}c_fill,g_auto,w_${THUMB * 2},h_${THUMB * 2},q_auto,f_jpg/${m[2]}`; // JPEG: every email app shows it
  if (url.startsWith("/uploads/")) return absUrl(url);
  return /^https:\/\//.test(url) ? url : undefined;
}
function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").match(/[A-Za-z]+/g) ?? [];
  const ini = words.filter((w) => !/^(and|with|of|the|in)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return ini || "•";
}
function itemsTable(l: EmailLocale, o: Order & { lines: OrderLine[] }, dishNames: Record<string, string>, photos: Record<string, string>): string {
  const rows = o.lines.map((ln) => {
    const name = esc(dishNames[ln.name] ?? ln.name);
    const src = emailThumb(photos[ln.itemId]);
    const thumb = src
      ? `<img src="${esc(src)}" width="${THUMB}" height="${THUMB}" alt="${name}" style="display:block;width:${THUMB}px;height:${THUMB}px;border-radius:8px;border:0;object-fit:cover">`
      : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="${THUMB}" height="${THUMB}" align="center" valign="middle" style="width:${THUMB}px;height:${THUMB}px;border-radius:8px;background:#C98A24;background-image:linear-gradient(135deg,#E0A83E,#211D17);color:#ffffff;font-weight:bold;font-size:16px;font-family:Arial,Helvetica,sans-serif">${esc(initials(ln.name))}</td></tr></table>`;
    let mods = "";
    try { mods = (JSON.parse(ln.modifiers) as { label?: string }[]).map((m) => m.label).filter(Boolean).join(", "); } catch { /* none */ }
    const price = ln.unitPrice === 0 ? t(l, "word.free") : money(ln.unitPrice * ln.qty);
    return `<tr><!--notext--><td width="${THUMB + 12}" style="padding:6px 12px 6px 0;vertical-align:middle">${thumb}</td><!--/notext-->`
      + `<td style="padding:6px 0;vertical-align:middle;font-size:15px;line-height:1.4">${ln.qty} × ${name}${mods ? `<br><span style="font-size:13px;color:#6b6257">+ ${esc(mods)}</span>` : ""}</td><!--notext--> <!--/notext-->`
      + `<td align="right" style="padding:6px 0 6px 12px;vertical-align:middle;font-size:15px;white-space:nowrap">${price}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #eee5d6;border-bottom:1px solid #eee5d6">${rows}</table>`;
}

/** `photos`: menu photo per dish id (item.image), used for the small pictures next to each dish. */
export function orderEmail(event: OrderEvent, o: Order & { lines: OrderLine[] }, biz: Business, dishNames: Record<string, string> = {}, trackUrl?: string, photos: Record<string, string> = {}): Built {
  const l = asEmailLocale(o.locale);
  const ref = b(esc(o.id));
  const plainRef = esc(o.id);
  const type = t(l, o.fulfilment === "delivery" ? "word.delivery" : "word.collection");
  const when = o.whenType === "scheduled" && o.scheduledAt ? t(l, "when.scheduled", { time: b(esc(dateTime(l, o.scheduledAt))) }) : t(l, "when.asap", { mins: o.etaMins });
  const pay = o.paymentMethod === "wechat"
    ? t(l, o.paymentStatus === "paid" ? "pay.wechatPaid" : "pay.wechatPending")
    : t(l, "pay.cash", { total: b(money(o.total)) });
  const address = o.fulfilment === "delivery" ? `${esc(o.address)}${o.postcode ? `, ${esc(o.postcode)}` : ""}` : `${esc(biz.address.line1)}, ${esc(biz.address.city)} ${esc(biz.address.postcode)}`;
  const items = itemsTable(l, o, dishNames, photos);
  const phone = esc(biz.phone);
  const track = trackUrl ? [`${t(l, "order.trackHint")}<br>${button(trackUrl, t(l, "order.trackButton"))}`] : [];

  switch (event) {
    case "received":
      return build(l, biz, t(l, "order.received.subject", { ref: plainRef }), t(l, "order.received.heading", { name: firstName(o.customerName) }), [
        t(l, "order.received.summary", { ref, type, when }),
        items,
        `${o.discount > 0 ? t(l, "order.totalDiscount", { total: b(money(o.total)), discount: money(o.discount) }) : t(l, "order.total", { total: b(money(o.total)) })} ${pay}`,
        t(l, o.fulfilment === "delivery" ? "order.deliverTo" : "order.collectFrom", { address }),
        ...track,
        t(l, o.fulfilment === "delivery" ? "order.nextDelivery" : "order.nextCollection", { phone, ref }),
      ]);
    // These two also say "enjoy your meal": there's no separate "completed" email.
    case "out-for-delivery":
      return build(l, biz, t(l, "order.onWay.subject", { ref: plainRef }), t(l, "order.onWay.heading"), [t(l, "order.onWay.body", { ref, address }), items, pay, ...track, t(l, "order.enjoy")]);
    case "ready-for-collection":
      return build(l, biz, t(l, "order.ready.subject", { ref: plainRef }), t(l, "order.ready.heading"), [t(l, "order.ready.body", { ref, address }), items, pay, ...track, t(l, "order.enjoy")]);
    case "cancelled":
      return build(l, biz, t(l, "order.cancelled.subject", { ref: plainRef }), t(l, "order.cancelled.heading"), [
        o.cancelReason ? t(l, "order.cancelled.bodyReason", { ref, total: money(o.total), reason: esc(o.cancelReason) }) : t(l, "order.cancelled.body", { ref, total: money(o.total) }),
        items,
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

/* ------------------------------------------------------------------ referrals */

/** To the referrer, once their friend's first order is completed. */
export function referralEmail(name: string, locale: string, biz: Business, amount: number, code: string, expires: Date): Built {
  const l = asEmailLocale(locale);
  const when = expires.toLocaleDateString(INTL[l], { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const amt = gbpShort(amount);
  return build(l, biz, t(l, "referral.reward.subject", { amount: esc(amt.slice(1)) }), t(l, "referral.reward.heading"), [
    t(l, "referral.reward.body", { name: firstName(name), amount: b(esc(amt)) }),
    t(l, "referral.reward.how", { code: b(esc(code)), expires: esc(when) }),
    button(`${SITE_URL}/menu`, t(l, "campaign.orderNow")),
  ]);
}

/* ------------------------------------------------------------------ offers */

/** Optional picture and file link on a promotional email (URLs already checked: our uploads only). */
export interface CampaignMedia { imageUrl?: string | null; fileUrl?: string | null; fileName?: string | null }
const absUrl = (u: string) => (u.startsWith("/") ? `${SITE_URL}${u}` : u);

/** A promotional email written by the owner (already chosen in the customer's language). */
export function campaignEmail(subject: string, body: string, name: string, locale: string, unsubscribeUrl: string, biz: Business, media: CampaignMedia = {}): Built {
  const l = asEmailLocale(locale);
  const paras = body.trim().split(/\n{2,}/).map((p) => esc(p).replace(/\n/g, "<br>"));
  const greeting = t(l, "campaign.greeting", { name: firstName(name) });
  const footer = `${t(l, "campaign.why")} <a href="${esc(unsubscribeUrl)}" style="color:#6b6257">${t(l, "campaign.unsubscribe")}</a>`;
  const btn = (href: string, label: string, dark = true) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${dark ? "#1f1b16" : "#ffffff"};color:${dark ? "#ecbb4e" : "#1f1b16"};border:1px solid #1f1b16;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">${label}</a>`;
  const image = media.imageUrl ? `<img src="${esc(absUrl(media.imageUrl))}" alt="${esc(subject)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:12px;border:0">` : null;
  const fileLabel = media.fileName ? esc(media.fileName) : t(l, "campaign.openFile");
  const file = media.fileUrl ? btn(absUrl(media.fileUrl), `&#128196; ${fileLabel}`, false) : null;
  const blocks = [greeting, ...(image ? [image] : []), ...paras, ...(file ? [file] : []), btn(`${SITE_URL}/menu`, t(l, "campaign.orderNow"))];
  const html = layout(l, biz, esc(subject), blocks, footer);
  const text = [
    stripTags(greeting), "", body.trim(), "",
    ...(media.fileUrl ? [`${media.fileName || stripTags(t(l, "campaign.openFile"))}: ${absUrl(media.fileUrl)}`, ""] : []),
    `${stripTags(t(l, "campaign.orderNow"))}: ${SITE_URL}/menu`, "", `${stripTags(t(l, "campaign.unsubscribe"))}: ${unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}
