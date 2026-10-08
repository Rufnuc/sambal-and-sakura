# Red-Team & Production-Readiness Review — Sambal & Sakura

**Reviewer role:** adversarial safety / production-readiness review.
**Build reviewed:** the Next.js app in this repo (customer site + admin + accounts), as of this commit.
**Method:** white-box — findings are grounded in the actual source, not assumed. Severities reflect impact *if this were deployed to real customers as-is*.

> **Confidence legend:** **Confirmed** = verified in code/running app. **Probable** = strong inference from the architecture. **Unknown** = needs a test/decision not yet made.

---

## Scope note (important)

This build is a **front-end prototype with no backend**. All state — accounts, orders, bookings, loyalty points, rewards, analytics, admin data — lives in the **browser's `localStorage`**. There is no server, database, API, authentication service, or payment integration. "Cash only" means no card data is handled.

The supplied red-team template is written for **LLM-agent systems** (prompt injection, tool registries, kill switches, etc.). **Those sections are Not Applicable** here: there is no LLM, no tool-calling agent, no retrieval, no model in the request path. This review maps the template to the system that actually exists — a **conventional client-side web app** — and assesses web-app security, data integrity, reliability, privacy, and UX instead. Inventing agent behaviours that don't exist would be a false finding.

---

## Remediation status (update)

A real trusted server tier was built and the critical findings were fixed and **verified end-to-end** (register → server-priced order → DB → staff-authenticated admin):

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| RT-01 | No backend / client-trusted state | **Fixed** | Prisma + SQLite; orders/bookings/accounts/rewards persisted server-side. New order `SS-B7124` placed via API appears in the DB-backed admin queue. |
| RT-02 | Admin unauthenticated | **Fixed** | `/admin/*` redirects to `/staff/login`; admin APIs return **403** for non-staff (verified). Role-gated in the server layout + every admin route. |
| RT-03 | Fake auth | **Fixed** | bcrypt-hashed passwords, opaque DB sessions in httpOnly/SameSite cookies. |
| RT-04 | Client-trusted pricing/points | **Fixed** | Client sends only item ids + option ids + qty. Server recomputes prices & modifier deltas (`Curry`+duck → £6.90), fees, discounts, and points. Bogus voucher & below-minimum → 400. |
| RT-05 | Bypassable promos | **Fixed** | Wheel cooldown, voucher validity, reward single-use enforced server-side (2nd spin → 429). |
| RT-06 | Booking overbooking | **Fixed** | Availability + creation are server-authoritative with a transactional capacity re-check. |
| RT-07 | PII in localStorage | **Mostly fixed** | PII now in the server DB, not the browser. Retention/deletion endpoints still TODO. |
| RT-10 | No input validation | **Fixed** | zod schemas with length caps on every API input. |
| RT-11 | Third-party embeds, no consent | **Fixed** | Cookie-consent banner + Google Maps gated behind consent. |

**Still open (honest):** RT-08 (hours/open-status still use client clock for display; booking availability uses server time), RT-09 (placeholder phone/email — needs the real values), RT-12 (no automated tests / error monitoring yet), RT-13 (no formal a11y audit), RT-14 (placeholder food imagery), plus GDPR data-subject **export/delete** endpoints and moving the SQLite dev DB to managed Postgres for production.

---

## Findings (most severe first)

### RT-01 — No backend: all state is client-side and untrusted
- **Severity:** CRITICAL · **Category:** Architecture / Data integrity · **Confidence:** Confirmed
- **Scenario:** Orders, bookings, accounts, points, rewards, and analytics are read/written only in `localStorage` (`src/lib/store/*`, `src/lib/order.ts`, `src/lib/booking.ts`, `src/lib/admin/seed.ts`). Nothing is sent to a server.
- **Why it matters:** A placed order is never received by the restaurant. Everything a "customer" sees is their own browser's data. There is no source of truth.
- **Affected:** Every flow (ordering, booking, loyalty, CRM).
- **Fix:** Introduce a backend (DB + API) and move all writes/reads server-side with validation. **Temporary mitigation:** none — this is inherent to a prototype.
- **Regression test:** e2e test asserting an order POSTs to an API and is retrievable by the admin from the server.
- **Blocks production:** **YES.**

### RT-02 — Admin console has no authentication
- **Severity:** CRITICAL · **Category:** Access control · **Confidence:** Confirmed
- **Scenario:** `/admin`, `/admin/orders`, `/admin/customers`, etc. render for anyone who visits the URL. `robots.ts` disallows crawling `/admin`, but robots is not access control.
- **Reproduction:** Navigate to `http://<host>/admin/customers` — full CRM (names, emails, phones, spend) renders.
- **Fix:** Require authenticated staff sessions + role checks (middleware) before any `/admin` route or admin API. **Mitigation:** gate `/admin` behind HTTP basic auth or an allowlist at the edge until real auth ships.
- **Regression test:** unauthenticated GET `/admin/*` returns 401/redirect.
- **Blocks production:** **YES.**

### RT-03 — "Authentication" does not authenticate
- **Severity:** CRITICAL · **Category:** Auth / Impersonation · **Confidence:** Confirmed
- **Scenario:** `useAuth.login(email)` (`src/lib/store/auth.ts`) signs in by **email only** — no password, OTP, or verification. Accounts live in shared `localStorage` (`ss_users`).
- **Reproduction:** On any device, "Sign in" with `priya@example.com` (a seeded demo member) → full access to that account's points/rewards/history.
- **Why it matters:** Total account takeover by knowing/guessing an email. In a real multi-user deployment this is complete auth bypass.
- **Fix:** Real auth provider (password+hash or passwordless OTP), server sessions, email verification. **Mitigation:** none; the demo is intentionally password-free and must be labelled non-production (it is, in `auth-dialog.tsx` copy and the README).
- **Blocks production:** **YES.**

### RT-04 — Prices, discounts, points and rewards are client-trusted
- **Severity:** CRITICAL · **Category:** Business-logic integrity / Fraud · **Confidence:** Confirmed
- **Scenario:** Cart totals, voucher discounts (`voucherDiscount`), delivery fees (`deliveryFee`), loyalty points (`addPoints`), and rewards (`addReward`) are all computed and stored in the browser.
- **Reproduction:** DevTools → set `ss_auth.user.points` to 999999 and redeem for vouchers; or edit a cart line's `unitPrice`; or apply `SAKURA10` repeatedly.
- **Fix:** Server recomputes every price, fee, discount and points accrual from trusted data at order time; client values are display-only. **Mitigation:** none client-side.
- **Regression test:** server rejects an order whose client-sent total ≠ server-recomputed total.
- **Blocks production:** **YES.**

### RT-05 — Abuse controls (vouchers, wheel, referrals) are bypassable
- **Severity:** HIGH · **Category:** Fraud / Abuse · **Confidence:** Confirmed
- **Scenario:** Fortune-wheel weekly cooldown (`ss_wheel_last`), first-order voucher single-use, and referral "one per new customer" are enforced only in `localStorage`.
- **Reproduction:** Clear site data / use incognito → unlimited spins and repeated first-order discounts; self-refer with throwaway emails.
- **Fix:** Enforce per-account/per-device/per-payment limits server-side; dedupe referrals by verified identity; issue reward codes server-side with single-use redemption. **Mitigation:** cap exposure by making rewards low-value until server enforcement exists.
- **Blocks production:** **YES** (for the promotions features; the rest of the site could ship without them).

### RT-06 — No shared state → booking overbooking & stale availability
- **Severity:** HIGH · **Category:** Reliability / Correctness · **Confidence:** Confirmed
- **Scenario:** Availability (`slotsForDate`) is computed from the *local* browser's bookings only. Two customers on two devices never see each other's bookings; walk-in reserve is advisory.
- **Why it matters:** Real-world double-booking and broken "live availability" promise.
- **Fix:** Server-authoritative availability with atomic seat/table allocation and transactional booking. **Mitigation:** none client-side.
- **Blocks production:** **YES.**

### RT-07 — PII stored unencrypted in the browser; no retention/deletion
- **Severity:** HIGH · **Category:** Privacy / UK GDPR · **Confidence:** Confirmed
- **Scenario:** Names, phones, emails, delivery addresses and order notes are persisted in `localStorage` (and would be, in prod, logged/stored). No consent, retention limit, deletion, or access control.
- **Fix:** Minimise and encrypt PII at rest server-side; implement consent, data-subject access/deletion, retention windows, and a cookie-consent banner (also needed for the Google Maps iframe & Google Fonts — see RT-11). **Mitigation:** avoid collecting address/notes until backend + policy exist.
- **Blocks production:** **YES** (UK GDPR).

### RT-08 — Open-status and hours depend on the client clock/timezone
- **Severity:** MEDIUM · **Category:** Correctness · **Confidence:** Confirmed
- **Scenario:** `getOpenState()` uses `new Date()` (device local time). A device in another timezone or with a wrong clock shows an incorrect "Open now", and `asapCutoffBeforeCloseMins` isn't actually enforced at checkout.
- **Fix:** Derive open/closed and order cut-offs from server time in `Europe/London`. **Mitigation:** display hours as authoritative and label the status as indicative.
- **Blocks production:** No (but fix before relying on ASAP cut-offs).

### RT-09 — Placeholder contact details could mislead real customers
- **Severity:** MEDIUM · **Category:** Correctness / Trust · **Confidence:** Confirmed
- **Scenario:** Phone `+44 1642 245888` and `hello@sambalandsakura.co.uk` are placeholders (flagged in `site.ts`), surfaced in header, footer, JSON-LD and `tel:`/`mailto:` links.
- **Fix:** Replace with verified details before any public launch. **Regression test:** CI check that no `PLACEHOLDER`-marked values ship in a production build.
- **Blocks production:** **YES** (do not publish fake contact routes).

### RT-10 — No form hardening (rate limit, bot protection, length caps)
- **Severity:** MEDIUM · **Category:** Reliability / Abuse · **Confidence:** Confirmed (absence)
- **Scenario:** Contact, sign-up, order and booking forms have client validation only; no server-side validation, length limits, rate limiting, or bot/CAPTCHA.
- **Note:** React escapes rendered text, so stored-XSS via names/notes is mitigated in the UI; but there is no sanitisation/validation layer because there is no server.
- **Fix:** Server validation + length caps + rate limiting + bot mitigation at launch. **Blocks production:** **YES** (for public forms).

### RT-11 — Third-party embeds with no consent gate
- **Severity:** MEDIUM · **Category:** Privacy / Compliance · **Confidence:** Confirmed
- **Scenario:** Google Maps `iframe` (homepage, contact) and Google Fonts load third-party resources that may set cookies / log IPs before consent. No cookie-consent UI exists.
- **Fix:** Consent banner; lazy-load the map behind consent; self-host fonts. **Blocks production:** **YES** in the UK/EU.

### RT-12 — No automated tests; no observability
- **Severity:** MEDIUM · **Category:** Evaluation / Operations · **Confidence:** Confirmed (absence)
- **Scenario:** Zero unit/e2e tests. No error reporting, audit log, or monitoring (there's no server to emit them). `error.tsx` logs to console only.
- **Fix:** Add e2e (Playwright) for the critical flows, unit tests for pricing/availability/loyalty math, server audit logs, and error reporting (Sentry). **Blocks production:** **YES** (no regression safety for money-affecting logic).

### RT-13 — Accessibility is addressed but unaudited
- **Severity:** LOW · **Category:** UX / Accessibility · **Confidence:** Probable
- **Scenario:** Good signals present — focus-visible, `aria-label`s, `role="switch"`, reduced-motion handling, 44px+ primary targets, numeric `inputmode`. Not yet validated with axe or a screen reader; some icon-only controls and the SVG wheel need label/keyboard checks.
- **Fix:** Run axe + keyboard + VoiceOver/NVDA pass; add an a11y CI check. **Blocks production:** No (should precede launch).

### RT-14 — Placeholder dish art could be mistaken for food
- **Severity:** LOW · **Category:** UX / Trust · **Confidence:** Confirmed
- **Scenario:** `DishImage` renders branded gradient placeholders with initials; `aria-label` says "photo coming soon", but a hurried user may read them as stylised product shots.
- **Fix:** Replace with real photography before launch (the brief requires photos on every item). **Blocks production:** **YES** per the brief's "highly visual menu" requirement.

### RT-15 — `dangerouslySetInnerHTML` for JSON-LD (defence-in-depth)
- **Severity:** INFORMATIONAL · **Category:** Security hygiene · **Confidence:** Confirmed
- **Scenario:** `structured-data.tsx` injects static, non-user data via `dangerouslySetInnerHTML` — currently safe.
- **Fix:** Keep it fed only by static config; add a lint rule so user data can never flow into it.
- **Blocks production:** No.

---

## Not Applicable (template sections with no corresponding surface)

- **Prompt injection / indirect injection / jailbreaks / malicious tool instructions** — no LLM or tool-calling agent exists.
- **Tool registry, schemas, idempotency, confirmation gates, kill switch** — no agent actions; the closest analogue is the admin status-change buttons, which are local-only and reversible.
- **Cross-tenant model/memory isolation** — no model, no tenancy layer (single client app).

These should be revisited **only if** an AI feature (e.g. an ordering chatbot) is added later.

---

## Production-Go Decision

### 1. Production blockers
RT-01 (no backend), RT-02 (admin unauthenticated), RT-03 (fake auth), RT-04 (client-trusted money/points), RT-05 (bypassable promos), RT-06 (overbooking), RT-07 (PII/GDPR), RT-09 (placeholder contacts), RT-10 (form hardening), RT-11 (consent), RT-12 (tests/observability), RT-14 (real photos).

### 2. High-risk unresolved issues
Auth takeover, financial/loyalty fraud via client tampering, promo abuse, booking collisions.

### 3. Required before any pilot
Backend + DB + API; real staff auth on `/admin`; real customer auth; server-authoritative pricing/fees/discounts/points; server-authoritative booking allocation; real contact details; cookie consent; basic monitoring + audit log; e2e tests for order & booking.

### 4. Can wait until after launch
Accessibility formal audit (do it close to launch), OG per-page variants, PWA/offline, advanced analytics, marketing SEO tuning, loyalty tier richness.

### 5. Minimum safe deployment plan
Deploy **only as a clearly-labelled design/UX prototype** (internal or stakeholder demo) at a non-customer URL, with `/admin` behind edge auth and a visible "demo — orders are not received" banner. Do **not** accept real orders or real PII until the pilot requirements (item 3) are met.

### 6. Required monitoring & alerts (once a backend exists)
Order-placement success/failure rate; booking write failures; auth anomalies; payment/cash-reconciliation (if added); 5xx and client error rates; availability-engine conflicts.

### 7. Required human-approval controls
Refunds/comps, large-party deposits, voucher/wheel reward issuance thresholds, menu price changes — all behind authenticated staff roles with an audit trail.

### 8. Rollback & kill-switch
Feature flags to disable online ordering, bookings, the wheel, and referrals independently; a global "pause online orders" switch surfaced in `/admin/settings`; standard app rollback via the host.

### 9. Prioritised remediation roadmap
1. Backend + DB + API; server auth for `/admin` and customers (RT-01/02/03).
2. Server-authoritative pricing, fees, discounts, points, booking allocation (RT-04/06).
3. GDPR: consent, retention, deletion, PII handling; real contacts (RT-07/09/11).
4. Abuse enforcement server-side; form hardening/rate limiting (RT-05/10).
5. Tests + monitoring + audit logs (RT-12); real photography (RT-14).
6. Accessibility audit; timezone-correct hours/cut-offs (RT-13/08).

### 10. Final decision

- **As a public, customer-facing production system: NO-GO.** It has no backend, no real authentication, client-trusted money and loyalty, bypassable promos, and a GDPR gap. Multiple "GO-gating" prerequisites (tool/data isolation, auditability, server-side enforcement, tests) are absent by design.
- **As a design/UX prototype or stakeholder demo: CONDITIONAL GO** — provided `/admin` is gated at the edge, a "demo, orders not received" banner is shown, and no real customer PII or orders are accepted.

The front-end is well-structured, on-brand, accessible-leaning, and buildable; the gap to production is **the entire trusted server tier**, not the UI.
