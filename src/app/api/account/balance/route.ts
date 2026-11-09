import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth";
import { getSiteContent } from "@/server/site-content";
import { formatAddress } from "@/lib/site-content";
import { balanceStatus, balanceTerms, entryLabel, toPounds, BALANCE_TERMS_VERSION } from "@/server/balance";
import { clientIp, limitOr429 } from "@/server/rate-limit";
import { audit } from "@/server/audit";

// The signed-in customer's prepaid balance. Nothing shows for customers it hasn't been offered to.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const status = balanceStatus(user);
  if (status === "none") return NextResponse.json({ status });
  const [{ business: b }, entries] = await Promise.all([
    getSiteContent(),
    prisma.balanceEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    status,
    balance: toPounds(user.balancePence),
    pct: user.balanceDiscountPct,
    acceptedAt: status === "active" ? user.balanceTermsAcceptedAt : null,
    terms: balanceTerms({ pct: user.balanceDiscountPct, phone: b.phone, email: b.email, address: formatAddress(b.address) }),
    entries: entries.map((e) => ({ id: e.id, at: e.createdAt, label: entryLabel(e), amount: toPounds(e.amountPence), after: toPounds(e.balanceAfterPence) })),
  });
}

const schema = z.object({ action: z.enum(["accept", "decline"]), version: z.string().max(40).optional() });

// POST {action: "accept", version} / {action: "decline"}: the customer's answer to the prepaid-balance terms.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const limited = await limitOr429([{ name: "balance-terms", id: user.id, limit: 10, windowSec: 3600 }]);
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please try again." }, { status: 400 });
  if (balanceStatus(user) !== "offered") return NextResponse.json({ error: "There's nothing to accept right now." }, { status: 409 });
  const { action, version } = parsed.data;
  if (action === "accept" && version !== BALANCE_TERMS_VERSION) {
    return NextResponse.json({ error: "These terms have just been updated. Please read the new version and accept again." }, { status: 409 });
  }
  // Guarded on the status they saw, so a second tap (or another device) can't flip it twice.
  const r = await prisma.user.updateMany({
    where: { id: user.id, balanceStatus: user.balanceStatus },
    data: action === "accept"
      ? { balanceStatus: "active", balanceTermsVersion: BALANCE_TERMS_VERSION, balanceTermsAcceptedAt: new Date() }
      : { balanceStatus: "declined" },
  });
  if (r.count !== 1) return NextResponse.json({ error: "Please refresh the page and try again." }, { status: 409 });
  await audit({ actor: { id: user.id, email: user.email }, action: `balance.terms.${action}`, entity: "user", entityId: user.id, detail: { version: BALANCE_TERMS_VERSION, balance: toPounds(user.balancePence) }, ip: clientIp(req) });
  return NextResponse.json({ ok: true, status: action === "accept" ? "active" : "declined" });
}
