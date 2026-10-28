import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword, createSession, publicUser } from "@/server/auth";
import { redeemLink, linkValid } from "@/server/email-links";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { audit } from "@/server/audit";

const schema = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(100).optional() });
const EXPIRED = "This reset link has expired or has already been used. Please ask for a new one from the sign-in box.";

// POST {token}: is the link still usable? POST {token, password}: set the new password.
export async function POST(req: Request) {
  const limited = await limitOr429([{ name: "reset-ip", id: clientIp(req), limit: 10, windowSec: 900 }]);
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Your new password must be 8 to 100 characters." }, { status: 400 });
  const { token, password } = parsed.data;
  if (!password) return (await linkValid(token, "reset")) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: EXPIRED }, { status: 410 });

  const userId = await redeemLink(token, "reset");
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user || user.role !== "customer" || user.status === "closed") return NextResponse.json({ error: EXPIRED }, { status: 410 });

  // Clicking the emailed link proves they own the inbox, so the email now counts as confirmed. If it wasn't
  // confirmed before, someone else may have signed up with this address: their marketing choice is cleared,
  // and every device signed in to the account (theirs) is signed out.
  const firstProof = !user.emailVerifiedAt;
  const passwordHash = await hashPassword(password);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, ...(firstProof ? { emailVerifiedAt: new Date(), marketingOptIn: false, marketingOptInAt: null } : {}) },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.authToken.deleteMany({ where: { userId: user.id, purpose: "reset", usedAt: null } });
    await audit({ actor: { id: user.id, email: user.email }, action: "password.reset", entity: "user", entityId: user.id, ip: clientIp(req) }, tx);
    return u;
  });
  // Signed in straight away, unless the account is deactivated (signing in then offers to reactivate it).
  if (updated.status === "active") await createSession(updated);
  return NextResponse.json({ ok: true, signedIn: updated.status === "active", user: updated.status === "active" ? publicUser(updated) : null });
}
