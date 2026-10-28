import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/server/db";
import { sendTransactional } from "@/server/email";
import { authLinkEmail } from "@/server/email-templates";
import { getSiteContent } from "@/server/site-content";
import { SITE_URL } from "@/lib/site-url";

// One-time links emailed to customers: "confirm your email" and "reset your password".
// Only a SHA-256 of the token is stored. The token travels after a "#" in the link, so it never reaches
// our server logs (or an email scanner that only fetches the page): the page reads it and posts it back.
// Links are always built from SITE_URL, never from the request's Host header, so a crafted request can't
// make us email a link pointing at someone else's site.

export type LinkPurpose = "verify" | "reset";
const LIFETIME_MS: Record<LinkPurpose, number> = { verify: 7 * 86400_000, reset: 30 * 60_000 };
const PATH: Record<LinkPurpose, string> = { verify: "/verify-email", reset: "/reset-password" };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Make a fresh link (any older unused link of the same kind stops working) and email it. Never throws. */
export async function emailLink(user: Pick<User, "id" | "email" | "name" | "locale">, purpose: LinkPurpose): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const row = await prisma.$transaction(async (tx) => {
    await tx.authToken.deleteMany({ where: { userId: user.id, purpose, usedAt: null } });
    return tx.authToken.create({ data: { tokenHash: sha256(token), userId: user.id, purpose, expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]) } });
  });
  const { business } = await getSiteContent();
  const m = authLinkEmail(purpose, user.name, user.locale, business, `${SITE_URL}${PATH[purpose]}#t=${token}`);
  await sendTransactional(`auth-${purpose}`, `auth:${purpose}:${row.id}`, { to: { email: user.email, name: user.name }, ...m });
}

/**
 * Use a link: returns its user id, or null if it's wrong, expired or already used. Atomic, so the same
 * link can't be used twice even by two requests at the same moment.
 */
export async function redeemLink(token: string, purpose: LinkPurpose): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const used = await prisma.authToken.updateMany({ where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  return (await prisma.authToken.findUnique({ where: { tokenHash }, select: { userId: true } }))?.userId ?? null;
}

/** Is this link still usable? (The reset page checks before asking for a new password.) */
export async function linkValid(token: string, purpose: LinkPurpose): Promise<boolean> {
  if (!token || token.length > 200) return false;
  return (await prisma.authToken.count({ where: { tokenHash: sha256(token), purpose, usedAt: null, expiresAt: { gt: new Date() } } })) === 1;
}
