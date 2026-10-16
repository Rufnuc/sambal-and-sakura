import Link from "next/link";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { OpenStatus } from "@/components/brand/open-status";
import { FOOTER_NAV } from "@/lib/nav";
import { RESTAURANT, COMPANY } from "@/lib/data/site";
import { CookieSettingsButton } from "@/components/cookie-settings-button";
import { formatHours } from "@/lib/hours";
import { telHref } from "@/lib/site-content";
import { getSiteContent } from "@/server/site-content";

export async function SiteFooter() {
  const { business: b, reviews } = await getSiteContent();
  const showReviews = reviews.show && reviews.items.length > 0;
  return (
    <footer className="mt-auto bg-sidebar text-sidebar-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Wordmark className="[&_span]:text-sidebar-foreground" />
            <p className="mt-4 text-sm text-sidebar-foreground/80">{b.blurb}</p>
            <div className="mt-4">
              <OpenStatus />
            </div>
            <div className="mt-5 flex gap-3">
              {b.social.instagram && (
              <a href={b.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="inline-flex size-10 items-center justify-center rounded-full border border-sidebar-border transition hover:bg-sidebar-accent">
                <InstagramGlyph />
              </a>
              )}
              {b.social.tiktok && (
              <a href={b.social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="inline-flex size-10 items-center justify-center rounded-full border border-sidebar-border transition hover:bg-sidebar-accent">
                <TikTokGlyph />
              </a>
              )}
              {b.social.facebook && (
              <a href={b.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="inline-flex size-10 items-center justify-center rounded-full border border-sidebar-border transition hover:bg-sidebar-accent">
                <FacebookGlyph />
              </a>
              )}
              {b.social.rednote && (
              <a href={b.social.rednote} target="_blank" rel="noopener noreferrer" aria-label="RedNote" className="inline-flex size-10 items-center justify-center rounded-full border border-sidebar-border transition hover:bg-sidebar-accent">
                <RedNoteGlyph />
              </a>
              )}
              {b.social.wechat && (
              <span aria-label={`WeChat: ${b.social.wechat}`} title={`WeChat: ${b.social.wechat}`} className="inline-flex size-10 cursor-help items-center justify-center rounded-full border border-sidebar-border transition hover:bg-sidebar-accent">
                <WeChatGlyph />
              </span>
              )}
            </div>
          </div>

          {FOOTER_NAV.map((col) => (
            <div key={col.heading}>
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-sidebar-foreground/90">{col.heading}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.filter((l) => l.href !== "/#reviews" || showReviews).map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-sidebar-foreground/80 transition hover:text-gold-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="brand-divider my-10" />

        <div className="grid gap-6 text-sm text-sidebar-foreground/80 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-gold-ink" />
            <span>{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}<br />{b.address.city} {b.address.postcode}</span>
          </div>
          <a href={telHref(b.phone)} className="flex items-center gap-3 hover:text-gold-ink">
            <Phone className="size-4 shrink-0 text-gold-ink" /> {b.phone}
          </a>
          <a href={`mailto:${b.email}`} className="flex items-center gap-3 hover:text-gold-ink">
            <Mail className="size-4 shrink-0 text-gold-ink" /> {b.email}
          </a>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-gold-ink" />
            <ul className="space-y-0.5">
              {b.hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-4">
                  <span>{h.day}</span>
                  <span className="text-right">{formatHours(h)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 text-xs text-sidebar-foreground/50 sm:flex-row sm:items-start">
          <div className="text-center sm:text-left">
            <p>© {new Date().getFullYear()} {RESTAURANT.name}. <span className="text-[10px]">All food halal.</span></p>
            {/* Trading disclosures: a limited company's website must show these. */}
            <p className="mt-1 text-[10px] leading-relaxed">
              {RESTAURANT.name} is the trading name of {COMPANY.name}, registered in {COMPANY.registeredIn}, company no. {COMPANY.number}.
              Registered office: {COMPANY.registeredOffice}.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:justify-end">
            <Link href="/legal/privacy" className="hover:text-gold-ink">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-gold-ink">Terms</Link>
            <Link href="/legal/promotions" className="hover:text-gold-ink">Promotions</Link>
            <Link href="/legal/cookies" className="hover:text-gold-ink">Cookies</Link>
            <CookieSettingsButton className="hover:text-gold-ink" />
            <Link href="/legal/accessibility" className="hover:text-gold-ink">Accessibility</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.4c-1.3 0-2.5-.4-3.5-1.1v6.3c0 3.1-2.5 5.6-5.6 5.6S5.3 17.6 5.3 14.5 7.8 8.9 10.9 8.9c.3 0 .6 0 .9.1v2.5c-.3-.1-.6-.1-.9-.1-1.7 0-3.1 1.4-3.1 3.1s1.4 3.1 3.1 3.1 3.1-1.4 3.1-3.1V3h2.5z" />
    </svg>
  );
}
function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
    </svg>
  );
}
function RedNoteGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="4" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--sidebar)">小</text>
    </svg>
  );
}
function WeChatGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M9 4C5.1 4 2 6.7 2 10c0 1.8 1 3.5 2.6 4.6L4 17l2.6-1.3c.5.1 1 .2 1.5.2h.4a5.5 5.5 0 0 1-.3-1.8c0-3 2.9-5.4 6.5-5.4h.6C14.7 5.9 12.1 4 9 4zm-2 4.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" />
      <path d="M22 14.3c0-2.7-2.6-4.9-5.8-4.9s-5.8 2.2-5.8 4.9 2.6 4.9 5.8 4.9c.5 0 1-.1 1.4-.2l2.2 1.1-.5-1.9c1.6-.9 2.7-2.3 2.7-3.9zm-7.8-1.1a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm3.6 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" />
    </svg>
  );
}
