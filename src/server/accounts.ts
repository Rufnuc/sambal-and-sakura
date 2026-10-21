import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/server/db";
import { hmac } from "@/server/secrets";
import { hashPassword } from "@/server/auth";
import { getSiteContent } from "@/server/site-content";
import { sendTransactional } from "@/server/email";
import { accountEmail } from "@/server/email-templates";
import { log } from "@/server/log";
import { ukParts } from "@/server/order-time";

// Customer account lifecycle:
//   active → deactivate → (sign in + "Reactivate" within 14 days) → active
//                       → (14 days pass) → closed
//   active → delete → closed
// Closed accounts are never deleted from the database, but their personal details are removed
// (UK GDPR) and a keyed fingerprint of the email is kept so it can't be used to sign up again
// (stops people re-creating accounts to collect sign-up rewards again).

export const REACTIVATE_DAYS = 14;
const DAY = 86_400_000;

const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const emailFingerprint = (email: string) => hmac("email", normaliseEmail(email));

export async function isEmailBlocked(email: string): Promise<boolean> {
  return !!(await prisma.blockedEmail.findUnique({ where: { hash: emailFingerprint(email) } }));
}

/** Owner tool: let a blocked email sign up again (e.g. someone missed the 14 days by mistake). */
export async function unblockEmail(email: string): Promise<boolean> {
  const r = await prisma.blockedEmail.deleteMany({ where: { hash: emailFingerprint(email) } });
  return r.count > 0;
}

export function reactivationDeadline(u: Pick<User, "deactivatedAt">): Date | null {
  return u.deactivatedAt ? new Date(u.deactivatedAt.getTime() + REACTIVATE_DAYS * DAY) : null;
}

async function emailUser(u: Pick<User, "id" | "email" | "name" | "locale">, event: "deactivated" | "closed" | "reactivated", deadline?: Date) {
  const { business } = await getSiteContent();
  const m = accountEmail(event, u.name, u.locale, business, deadline);
  // At most one email per account, per kind, per UK day: switching an account off and on repeatedly
  // can't be used to burn through the daily email allowance.
  void sendTransactional(`account-${event}`, `account:${u.id}:${event}:${ukParts(new Date()).dateKey}`, { to: { email: u.email, name: u.name }, ...m });
}

export async function deactivateAccount(u: User): Promise<Date> {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { status: "deactivated", deactivatedAt: now } }),
    prisma.session.deleteMany({ where: { userId: u.id } }),
  ]);
  const deadline = new Date(now.getTime() + REACTIVATE_DAYS * DAY);
  await emailUser(u, "deactivated", deadline);
  log.info("account_deactivated", { userId: u.id });
  return deadline;
}

export async function reactivateAccount(u: User): Promise<void> {
  await prisma.user.update({ where: { id: u.id }, data: { status: "active", deactivatedAt: null } });
  await emailUser(u, "reactivated");
  log.info("account_reactivated", { userId: u.id });
}

/**
 * Close for good: block the email, remove personal details from the account and its past
 * orders/bookings (order totals stay for the restaurant's accounts), drop points and rewards.
 */
export async function closeAccount(u: User, reason: "deleted" | "deactivation-expired"): Promise<void> {
  const { email, name, locale } = u;
  await prisma.$transaction([
    prisma.blockedEmail.upsert({ where: { hash: emailFingerprint(email) }, create: { hash: emailFingerprint(email), reason }, update: {} }),
    prisma.order.updateMany({ where: { userId: u.id }, data: { customerName: "Closed account", customerPhone: "", customerEmail: null, address: null, notes: null } }),
    prisma.booking.updateMany({ where: { userId: u.id }, data: { name: "Closed account", phone: "", email: null, notes: null, dietary: null } }),
    prisma.session.deleteMany({ where: { userId: u.id } }),
    prisma.reward.deleteMany({ where: { userId: u.id } }),
    prisma.pointsEntry.deleteMany({ where: { userId: u.id } }),
    prisma.user.update({
      where: { id: u.id },
      data: {
        status: "closed", closedAt: new Date(), deactivatedAt: null,
        email: `closed-${u.id}@closed.invalid`, name: "Closed account", phone: "",
        passwordHash: await hashPassword(randomBytes(32).toString("hex")), // nobody can sign in
        points: 0, marketingOptIn: false, marketingOptInAt: null,
      },
    }),
  ]);
  await emailUser({ id: u.id, email, name, locale }, "closed");
  log.info("account_closed", { userId: u.id, reason });
}

/** Daily job: close accounts whose 14-day reactivation window has passed. */
export async function closeExpiredDeactivations(): Promise<number> {
  const expired = await prisma.user.findMany({ where: { status: "deactivated", deactivatedAt: { lt: new Date(Date.now() - REACTIVATE_DAYS * DAY) } } });
  for (const u of expired) await closeAccount(u, "deactivation-expired");
  return expired.length;
}
