import type { Order, Prisma, User } from "@prisma/client";
import { prisma } from "@/server/db";
import { getReferralConfig, type ReferralConfig } from "@/server/config";
import { canonicalPhone, phoneKey } from "@/server/phone";
import { rewardCode } from "@/server/ids";
import { hit } from "@/server/rate-limit";
import { audit, type AuditActor } from "@/server/audit";
import { sendTransactional } from "@/server/email";
import { referralEmail } from "@/server/email-templates";
import { getSiteContent } from "@/server/site-content";
import { log } from "@/server/log";
import { gbpShort } from "@/lib/format";
import { getPromotions, graceEnds } from "@/server/promotions";

// Refer a friend.
//
//  1. Every customer has a permanent code (User.referralCode, made at sign-up) and a link /?ref=CODE.
//  2. A NEW customer signs up with that code → a Referral row (pending) and the friend's reward:
//     £give off their first order, food total at least £minSpend, first-order only (one per phone,
//     like every first-order offer, so it can't be stacked with the welcome 10%).
//  3. When the friend's first COMPLETED order reaches £minSpend, from a phone and address that aren't
//     the referrer's, the referrer gets £get off their next order and an email. Completed is final, so
//     a paid-out reward can't be undone by a later cancellation.
//  4. Anything that looks like self-referral is refused or voided, and the owner can void any referral
//     (Admin → Promotions), which also cancels unused rewards.

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
export const REFERRAL_REWARD_DAYS = 90; // both rewards expire after this
export const QUALIFY_DAYS = 90;          // the friend has this long to complete a qualifying order
const SIGNUPS_PER_CODE_PER_DAY = 5;

export class ReferralError extends Error {}

const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9-]/g, "");

/** Food total the friend paid for (before delivery; the friend's own discount doesn't count against them). */
const qualifyingSpend = (o: Pick<Order, "subtotal">) => o.subtotal;

/** Same home? Postcode plus the start of the first address line, ignoring spacing and punctuation. */
function addressKey(address: string | null, postcode: string | null): string | null {
  if (!address || !postcode) return null;
  const a = address.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${postcode.toUpperCase().replace(/[^A-Z0-9]/g, "")}|${a.slice(0, 12)}`;
}

/**
 * Check a referral code typed at sign-up. Returns the referrer, null when referrals are off, or throws
 * ReferralError for a problem with the CODE (invalid, at its limit, over-used today).
 *
 * Nothing here depends on the phone typed at sign-up: every valid code gets the same result (the friend's
 * reward and a pending referral), so neither the sign-up answer nor the new account can reveal whether a
 * phone has ordered before, was referred before or belongs to the code's owner. Those rules are enforced
 * where nobody can watch them: the friend's reward only works on a phone's first order (checkout), and the
 * referrer is only paid when the friend's phone was genuinely new (rewardReferrerIfQualified).
 */
export async function checkReferralCode(rawCode: string, cfg?: ReferralConfig): Promise<User | null> {
  const conf = cfg ?? (await getReferralConfig());
  if (!conf.enabled) return null;
  const code = normCode(rawCode);
  if (!code) return null;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
  if (!referrer || referrer.status !== "active" || referrer.role !== "customer") throw new ReferralError("That referral code isn't valid. Check it, or leave it empty.");
  if (conf.maxPerUser > 0) {
    const used = await prisma.referral.count({ where: { referrerId: referrer.id, status: { not: "void" } } });
    if (used >= conf.maxPerUser) throw new ReferralError("This referral code has reached its limit. You can still create your account without it.");
  }
  // A code being sprayed across many new accounts in a day is a farm, not friends.
  const r = await hit("referral-code", referrer.id, SIGNUPS_PER_CODE_PER_DAY, 86_400);
  if (!r.ok) throw new ReferralError("This referral code has been used a lot today. Please try again tomorrow, or create your account without it.");
  return referrer;
}

/** Nested-create data for the new user: the Referral row and the friend's reward. */
export function referralSignupData(referrer: User, code: string, phone: string, cfg: ReferralConfig) {
  return {
    referredBy: { create: { referrerId: referrer.id, code: normCode(code), refereePhoneKey: phoneKey(phone) } },
    reward: {
      label: `${gbpShort(cfg.give)} off your first order (food ${gbpShort(cfg.minSpend)}+)`,
      code: rewardCode("REF"), kind: "voucher", amount: cfg.give, minSpend: cfg.minSpend,
      source: "referral-welcome", expiresAt: new Date(Date.now() + REFERRAL_REWARD_DAYS * DAY),
    },
  };
}

/**
 * Inside the "order completed" transaction: if this customer was referred and this order qualifies,
 * reward the referrer. Returns the referral id when a reward was issued (the email goes out after commit).
 */
export async function rewardReferrerIfQualified(tx: Tx, order: Order): Promise<string | null> {
  if (!order.userId) return null;
  const ref = await tx.referral.findUnique({ where: { refereeId: order.userId } });
  if (!ref || ref.status !== "pending") return null;
  const cfg = await getReferralConfig();

  const voidIt = async (reason: string) => {
    await tx.referral.updateMany({ where: { id: ref.id, status: "pending" }, data: { status: "void", voidReason: reason, orderId: order.id } });
    log.info("referral_void", { referralId: ref.id, reason });
    return null;
  };

  if (Date.now() - ref.createdAt.getTime() > QUALIFY_DAYS * DAY) return voidIt("No qualifying order within 90 days");
  // Campaign switched off: referrals already made still pay out during its grace period, then end.
  const ends = graceEnds((await getPromotions()).referral);
  if (ends && ends <= new Date()) return voidIt("Referral campaign ended");
  if (qualifyingSpend(order) < cfg.minSpend) return null; // too small: a later completed order can still qualify

  const referrer = await tx.user.findUnique({ where: { id: ref.referrerId } });
  if (!referrer || referrer.status !== "active") return voidIt("Referrer's account isn't active");
  if (phoneKey(order.customerPhone) === phoneKey(referrer.phone)) return voidIt("Order placed with the referrer's phone number");
  // New customers only (checked here, not at sign-up, so it can't be used to look up a phone): the phone the
  // friend signed up with must not be the referrer's, must not have ordered before the sign-up, and must
  // not have been referred earlier by anyone.
  const key = ref.refereePhoneKey;
  if (key && key === phoneKey(referrer.phone)) return voidIt("Signed up with the referrer's phone number");
  const before = { createdAt: { lt: ref.createdAt } };
  const [orderedBefore, referredBefore] = await Promise.all([
    tx.order.count({ where: { ...before, status: { not: "cancelled" }, customerPhone: canonicalPhone(order.customerPhone) } }),
    key ? tx.referral.count({ where: { ...before, id: { not: ref.id }, refereePhoneKey: key, status: { not: "void" } } }) : Promise.resolve(0),
  ]);
  if (orderedBefore) return voidIt("The friend's phone had ordered before signing up");
  if (referredBefore) return voidIt("That phone number was already referred");

  // Delivered to the referrer's own address (any earlier delivery by their account or phone)?
  const home = addressKey(order.address, order.postcode);
  if (home) {
    const theirs = await tx.order.findMany({
      where: { OR: [{ userId: referrer.id }, { customerPhone: canonicalPhone(referrer.phone) }], address: { not: null } },
      select: { address: true, postcode: true }, take: 50, orderBy: { createdAt: "desc" },
    });
    if (theirs.some((o) => addressKey(o.address, o.postcode) === home)) return voidIt("Delivered to the referrer's address");
  }

  // Guarded: only one completion can flip pending → rewarded.
  const flipped = await tx.referral.updateMany({ where: { id: ref.id, status: "pending" }, data: { status: "rewarded", orderId: order.id, rewardedAt: new Date() } });
  if (flipped.count !== 1) return null;
  const reward = await tx.reward.create({
    data: {
      userId: referrer.id, label: `${gbpShort(cfg.get)} off - thanks for referring a friend`, code: rewardCode("THX"),
      kind: "voucher", amount: cfg.get, source: "referral", expiresAt: new Date(Date.now() + REFERRAL_REWARD_DAYS * DAY),
    },
  });
  await tx.referral.update({ where: { id: ref.id }, data: { rewardId: reward.id } });
  log.info("referral_rewarded", { referralId: ref.id, orderId: order.id });
  return ref.id;
}

/** After commit: tell the referrer their reward is ready (sent once per referral). Never throws. */
export async function emailReferralReward(referralId: string): Promise<void> {
  try {
    const ref = await prisma.referral.findUnique({ where: { id: referralId }, include: { referrer: true } });
    if (!ref?.rewardId || !ref.referrer.email) return;
    const reward = await prisma.reward.findUnique({ where: { id: ref.rewardId } });
    if (!reward) return;
    const { business } = await getSiteContent();
    const m = referralEmail(ref.referrer.name, ref.referrer.locale, business, reward.amount ?? 0, reward.code, reward.expiresAt);
    await sendTransactional("referral-reward", `referral:${ref.id}:reward`, { to: { email: ref.referrer.email, name: ref.referrer.name }, ...m });
  } catch (e) {
    log.error("referral_email_failed", { referralId, error: String(e).slice(0, 300) });
  }
}

/** Owner voids a referral: unused rewards from it (the friend's and the referrer's) stop working. */
export async function voidReferral(id: string, actor: AuditActor, reason: string, ip?: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.referral.findUnique({ where: { id } });
    if (!ref || ref.status === "void") return false;
    await tx.referral.update({ where: { id }, data: { status: "void", voidReason: reason || "Voided by the owner" } });
    const now = new Date();
    const rewardFilters: Prisma.RewardWhereInput[] = [{ userId: ref.refereeId, source: "referral-welcome" }];
    if (ref.rewardId) rewardFilters.push({ id: ref.rewardId });
    const expired = await tx.reward.updateMany({ where: { used: false, expiresAt: { gt: now }, OR: rewardFilters }, data: { expiresAt: now } });
    await audit({ actor, action: "referral.void", entity: "referral", entityId: id, detail: { reason, unusedRewardsCancelled: expired.count }, ip }, tx);
    return true;
  });
}

/** What a customer sees about their own referrals. */
export async function referralSummary(userId: string) {
  const [cfg, user, grouped] = await Promise.all([
    getReferralConfig(),
    prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, role: true } }),
    prisma.referral.groupBy({ by: ["status"], where: { referrerId: userId }, _count: true }),
  ]);
  const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
  const used = count("pending") + count("rewarded");
  return {
    enabled: cfg.enabled && user?.role === "customer",
    code: user?.referralCode ?? null,
    give: cfg.give, get: cfg.get, minSpend: cfg.minSpend,
    pending: count("pending"), rewarded: count("rewarded"),
    remaining: cfg.maxPerUser > 0 ? Math.max(0, cfg.maxPerUser - used) : null,
  };
}
