import type { Prisma, User } from "@prisma/client";
import { RESTAURANT, COMPANY } from "@/lib/data/site";

// Prepaid balance: a customer hands the restaurant money (e.g. £200) and spends it on orders - delivery,
// collection or eating in. It is NOT part of the normal service: the owner offers it to a customer in
// Admin -> Customers, and it only works once that customer has signed in and accepted these separate
// prepaid-balance terms. If they decline, the restaurant refunds anything already paid in.
//
// Money is kept in pence (whole numbers) so totals never drift. Every change is a BalanceEntry, and the
// balance only changes with guarded writes, so two requests at the same moment can't spend it twice.

/** Change this when the terms below change: customers must accept the new version before spending again. */
export const BALANCE_TERMS_VERSION = "2026-11-09";

export type BalanceStatus = "none" | "offered" | "active" | "declined";
export const toPence = (pounds: number) => Math.round(pounds * 100);
export const toPounds = (pence: number) => Math.round(pence) / 100;

type BalanceUser = Pick<User, "balanceStatus" | "balanceTermsVersion">;

/** Where the customer is, as they should see it: an accepted older version counts as "offered" again. */
export function balanceStatus(u: BalanceUser): BalanceStatus {
  const s = u.balanceStatus as BalanceStatus;
  if (s === "active" && u.balanceTermsVersion !== BALANCE_TERMS_VERSION) return "offered";
  return s === "offered" || s === "active" || s === "declined" ? s : "none";
}
/** Can this customer spend their balance right now? */
export const balanceUsable = (u: BalanceUser) => balanceStatus(u) === "active";

export class BalanceError extends Error {}

type Tx = Prisma.TransactionClient;
/**
 * Add (positive) or take (negative) money, and record it. Taking more than the balance throws BalanceError
 * and changes nothing. Returns the new balance in pence.
 */
export async function changeBalance(tx: Tx, userId: string, deltaPence: number, entry: { kind: string; orderId?: string | null; method?: string | null; note?: string | null; staffEmail?: string | null }): Promise<number> {
  const delta = Math.round(deltaPence);
  if (delta === 0) throw new BalanceError("The amount must be more than £0.");
  const r = await tx.user.updateMany({
    where: { id: userId, ...(delta < 0 ? { balancePence: { gte: -delta } } : {}) },
    data: { balancePence: { increment: delta } },
  });
  if (r.count !== 1) throw new BalanceError("There isn't enough money in the balance for that.");
  const { balancePence } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balancePence: true } });
  await tx.balanceEntry.create({ data: { userId, amountPence: delta, kind: entry.kind, orderId: entry.orderId ?? null, method: entry.method ?? null, note: entry.note?.slice(0, 200) || null, staffEmail: entry.staffEmail ?? null, balanceAfterPence: balancePence } });
  return balancePence;
}

/** How an entry reads to the customer and staff. */
export function entryLabel(e: { kind: string; orderId: string | null; note: string | null; method: string | null }): string {
  const how = e.method ? ` (${e.method === "bank" ? "bank transfer" : e.method})` : "";
  switch (e.kind) {
    case "topup": return `Money added${how}`;
    case "order": return `Order ${e.orderId ?? ""}`.trim();
    case "dine-in": return `Eat-in bill${e.note ? `: ${e.note}` : ""}`;
    case "refund": return `Refunded to you${how}`;
    case "reversal": return `Order ${e.orderId ?? ""} cancelled: money returned`.replace("  ", " ");
    default: return e.kind;
  }
}

export interface TermsSection { h: string; list: string[] }

/**
 * The prepaid-balance terms, shown to the customer in their account to accept (never part of the main
 * Terms & Conditions). `pct` is this customer's discount.
 * Have these checked by your accountant or solicitor before offering the balance.
 */
export function balanceTerms(opts: { pct: number; phone: string; email: string; address: string }): { title: string; version: string; sections: TermsSection[] } {
  const who = `${COMPANY.name} (trading as ${RESTAURANT.name}), company number ${COMPANY.number}, registered office ${COMPANY.registeredOffice}`;
  return {
    title: "Prepaid balance terms",
    version: BALANCE_TERMS_VERSION,
    sections: [
      { h: "What this is", list: [
        `A prepaid balance lets you pay ${RESTAURANT.name} in advance and spend it on your orders. It is offered by ${who}.`,
        "It's an optional arrangement between you and the restaurant, separate from our main Terms & Conditions, which still apply to every order.",
        `It can only be spent with ${RESTAURANT.name}. It isn't a bank account, earns no interest and isn't protected like money in a bank.`,
      ] },
      { h: "Adding money", list: [
        "You add money by giving it to the restaurant (for example cash, card or bank transfer). Staff record it on your account, and it shows in your balance history straight away.",
        "Keep any receipt you're given. If something doesn't look right in your history, tell us as soon as you can.",
      ] },
      { h: "Spending it", list: [
        "Online: when you're signed in, choose \"Pay from my balance\" at checkout. It's taken off when you place the order.",
        "Eating in: tell staff you'd like to pay from your balance and they'll take the bill off it.",
        "If your balance doesn't cover the whole amount, the rest is paid in the normal way (cash on delivery or collection, or at the table).",
        ...(opts.pct > 0
          ? [`Your discount: ${opts.pct}% off the food on orders paid from your balance. The restaurant can change or end this discount; you'll see the current rate in your account before you order.`]
          : ["There's no discount on orders paid from your balance unless the restaurant tells you otherwise; any discount shows in your account before you order."]),
      ] },
      { h: "Cancelled orders", list: [
        "If an order paid from your balance is cancelled, the amount taken goes back onto your balance.",
      ] },
      { h: "Refunds and expiry", list: [
        "Your balance doesn't expire.",
        `You can ask for any unused balance back at any time: call ${opts.phone}, email ${opts.email} or ask in the restaurant at ${opts.address}. We'll refund it, normally the same way you paid it in.`,
        "If you decline these terms, or close your account, we'll refund anything you've paid in.",
      ] },
      { h: "Changes", list: [
        "If we change these terms we'll ask you to accept the new version in your account before you can spend your balance again. If you don't want to, you can ask for a refund.",
      ] },
      { h: "Your information", list: [
        "We keep a record of every amount added, spent and refunded on your account, so you and we can check it. It's handled as described in our Privacy Policy.",
      ] },
    ],
  };
}
