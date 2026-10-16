// How long personal data is kept. The nightly jobs (src/server/jobs.ts) apply these, and the
// privacy policy (src/server/legal.ts) quotes them, so the published periods can't drift.
export const ORDER_PII_DAYS = Number(process.env.ORDER_PII_RETENTION_DAYS) || 730;   // 2 years
export const BOOKING_PII_DAYS = Number(process.env.BOOKING_PII_RETENTION_DAYS) || 365;
export const EVENT_DAYS = 90;
