# Sambal & Sakura — Direct-Ordering Restaurant Platform

A premium, conversion-focused restaurant web app for a Malaysian–Japanese fusion brand. Built as a **product**, not a brochure: direct online ordering, reservations with walk-in protection, vouchers, referrals, a fortune-cookie reward wheel, and a full operations/admin suite.

> **Demo build.** All menu data, prices, photos, address, reviews and analytics are **placeholder** and clearly fictional. State is stored in the browser (`localStorage`) so flows are fully clickable without a backend. Swap the data files and wire the marked integration points for production.

## Stack

- **Next.js 16** (App Router, RSC, Route Handlers, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives, Lucide icons)
- **Prisma + SQLite** (swap datasource to Postgres for prod) · **bcryptjs** (password hashing) · **zod** (validation)
- **Zustand** (cart) · **next-themes** (light/dark) · **Recharts** (admin charts)

### Trusted server tier
Orders, bookings, accounts, loyalty points and rewards live in the database behind authenticated API routes (`src/app/api/**`, `src/server/**`). The client never sends prices — the server recomputes every total, fee, discount and points accrual from trusted config (`src/server/pricing.ts`). Auth uses bcrypt-hashed passwords + DB sessions in httpOnly cookies. `/admin` is gated to `staff`/`admin` roles (server layout + per-route 403). See `RED-TEAM.md` for the security review and what it fixed.

## Run

```bash
npm install                       # also runs `prisma generate`
npm run db:migrate                # create the SQLite dev.db (first time)
npm run db:seed                   # seed staff + demo customers/orders/bookings
npm run dev                       # http://localhost:3000
```

**Demo logins** (local dev only): staff → `admin@sambalandsakura.co.uk` / `admin1234` (operations console at `/admin`); demo customers → `priya@example.com` … `daniel@example.com`, password `password`.

`npm run db:reset` re-migrates and reseeds. `npm run build` for a production build.

## Brand system

Deep charcoal base + refined warm gold accent (never pure yellow), with sambal red and sakura pink supports — consistent with the restaurant's black-and-yellow signage. Tokens live in [`src/app/globals.css`](src/app/globals.css) (`--gold`, `--sambal`, `--sakura`, `--ink`, `--jade`). Default theme is a warm light canvas for appetite/readability; a true charcoal **dark mode** ships via the header toggle. Type: **Playfair Display** (display) + **Karla** (body). Logo is inline SVG ([`src/components/brand/logo.tsx`](src/components/brand/logo.tsx)).

## Sitemap

**Customer** (`src/app/(site)/`)
- `/` Home — hero, direct-order savings, signature dishes, offers, referral + wheel teasers, reviews, map, CTAs
- `/menu` — searchable, filterable, category-grouped menu with quick-add & customiser
- `/order` — checkout: delivery/collection, postcode→zone validation, scheduling, cash-only, voucher, order confirmation + status tracker
- `/book` — reservations: party size, live date/time availability, **walk-in protection**, deposits, waitlist, confirmation
- `/offers` · `/refer` · `/wheel` — promotions, referral link generator, fortune-cookie spin wheel
- `/contact` (includes the FAQ; `/faq` redirects there) · `/legal/{privacy,terms,accessibility}`

**Accounts** (`src/app/(site)/account/`, `src/lib/store/auth.ts`)
- Sign up / sign in (demo auth, localStorage — no real passwords), header avatar menu.
- Loyalty: 10 pts/£1, Bronze→Silver→Gold→Jade tiers, redeem 100 pts → £5 off.
- Rewards wallet tied to the account (wheel wins + referral codes save to it, welcome reward + bonus points on signup).
- Orders & bookings attributed to the account; checkout/booking prefill; points awarded on order.

**Admin / Operations** (`src/app/admin/`)
- `/admin` Dashboard — KPIs + revenue/popularity/fulfilment charts
- `/admin/orders` — order queue with status transitions (received → preparing → out-for-delivery/ready → completed)
- `/admin/bookings` — reservation management (seat, complete, no-show, cancel, confirm waitlist)
- `/admin/floor` — live table occupancy by zone + capacity vs walk-in reserve
- `/admin/customers` — CRM: members, tiers, points, order count, spend
- `/admin/menu` — item availability (sold-out toggles, persisted)
- `/admin/promos` — offers, voucher usage, wheel probabilities, referral programme
- `/admin/analytics` — live conversion funnel + event feed
- `/admin/settings` — blackout dates (wired into booking), delivery-zone pause toggles (wired into checkout), booking/order rules

**SEO** — `sitemap.ts`, `robots.ts` (disallows `/admin` & `/account`), and JSON-LD `Restaurant` structured data (address, hours, cuisine, rating, menu sections) on the homepage. Styled 404 (`not-found.tsx`).

## Key business logic

- **Cash only**, surfaced throughout checkout.
- **Delivery zones / fees / minimum / free-delivery threshold**: [`src/lib/order.ts`](src/lib/order.ts) + [`src/lib/data/site.ts`](src/lib/data/site.ts).
- **Walk-in protection**: a configurable % of seats is held back (higher on peak nights) so online booking can never consume walk-in capacity — [`src/lib/booking.ts`](src/lib/booking.ts), [`src/lib/data/tables.ts`](src/lib/data/tables.ts). Turn times, buffers, deposits and waitlist included.
- **Wheel fairness**: weighted prizes, one spin per guest per week, codes expire in 7 days — [`src/components/wheel/spin-wheel.tsx`](src/components/wheel/spin-wheel.tsx).

## Data model (demo)

`MenuItem`, `Offer`, `Testimonial`, `Faq`, `WheelPrize` → [`src/lib/data/`](src/lib/data) · `CartLine` → cart store · `PlacedOrder` → [`src/lib/order.ts`](src/lib/order.ts) · `Booking` / `Table` → [`src/lib/booking.ts`](src/lib/booking.ts). Replace these modules with API/DB calls for production.

## Analytics events

Canonical map fires through [`src/lib/analytics.ts`](src/lib/analytics.ts): `view_menu`, `add_to_cart`, `begin_checkout`, `order_placed`, `booking_started`, `booking_confirmed`, `spin_wheel_played`, `voucher_redeemed`. The admin Analytics page reads them live; swap the sink for GA4/Segment in production.

## Accessibility & responsive

Mobile-first; sticky bottom CTA bar (Order/Book/Offers) on mobile. 44px+ touch targets on primary actions, visible focus, semantic labels, `prefers-reduced-motion` respected, `inputmode` on numeric/tel/search fields, WCAG-AA-oriented contrast in both themes. Breakpoints: 375 / 768 / 1024 / 1440.

## Production integration points (TODO)

Payments are intentionally **cash-only** (no card capture in-app). Wire these before launch:
- Orders/bookings persistence → database + API (replace `localStorage` helpers)
- SMS/email confirmations (order & booking updates), real map/geocoding, CRM
- POS/KDS/receipt-printer handoff, delivery dispatch
- Real menu CMS + photography (`DishImage` is a branded placeholder — swap for `next/image`)
- Auth & roles for `/admin`, audit logs, cookie consent, legally-reviewed policies
- Analytics sink (GA4/Segment), schema.org markup (Restaurant/Menu/Review), sitemap/robots

## Roadmap

- **MVP (this build):** customer ordering + reservations + promotions + full admin views, placeholder data.
- **Phase 2:** real backend & auth, payments-optional/deposits, SMS/email, POS/KDS, CMS, analytics sink.
- **Future:** loyalty tiers, kitchen throttling automation, driver app, multi-site, A/B testing.

## Risk register (highlights)

| Risk | Mitigation |
|---|---|
| Booking/walk-in collisions | Reserved-capacity model + waitlist, visible floor plan |
| Voucher/referral/wheel abuse | Min-spend, single-use codes, weekly spin cap, expiry |
| Cash reconciliation | Order totals + driver cash tracking (Phase 2) |
| Kitchen overload at peak | Prep-time/throttling config, ASAP cutoff before close |
| No-shows | Status tracking, deposits for large parties, reminders |
