import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { staffFor } from "@/server/auth";
import { actorOf } from "@/server/admin-view";
import { audit } from "@/server/audit";
import { clientIp } from "@/server/rate-limit";
import { zText } from "@/server/sanitize";
import { balanceStatus, balanceUsable, changeBalance, entryLabel, toPence, toPounds, BalanceError } from "@/server/balance";

// A customer's prepaid balance, for staff with Customers access. Money in and out (offer, add money,
// refund, discount %, withdraw) is for the owner only; staff can take an eat-in bill off an active balance.

type Ctx = { params: Promise<{ id: string }> };

async function view(id: string, canManage: boolean) {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, status: true, balanceStatus: true, balanceTermsVersion: true, balanceTermsAcceptedAt: true, balancePence: true, balanceDiscountPct: true } });
  if (!u || u.role !== "customer") return null;
  const entries = await prisma.balanceEntry.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 200 });
  return {
    id: u.id, name: u.name, email: u.email, accountStatus: u.status, canManage, // canManage: owner (money in/out, %)
    status: balanceStatus(u), balance: toPounds(u.balancePence), pct: u.balanceDiscountPct, acceptedAt: u.balanceTermsAcceptedAt,
    entries: entries.map((e) => ({ id: e.id, at: e.createdAt, label: entryLabel(e), amount: toPounds(e.amountPence), after: toPounds(e.balanceAfterPence), by: e.staffEmail })),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const staff = await staffFor("customers");
  if (!staff) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const v = await view((await ctx.params).id, staff.role === "admin");
  return v ? NextResponse.json(v) : NextResponse.json({ error: "Customer not found." }, { status: 404 });
}

const money = z.number().finite().positive("Enter an amount.").max(5000, "That's more than £5,000: please check the amount.");
const method = z.enum(["cash", "card", "bank"]);
const pct = z.number().finite().min(0).max(50, "The discount can be at most 50%.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("offer"), pct }),
  z.object({ action: z.literal("topup"), amount: money, method, note: zText(200).optional() }),
  z.object({ action: z.literal("charge"), bill: money, note: zText(200).optional() }),
  z.object({ action: z.literal("refund"), amount: money, method, note: zText(200).optional() }),
  z.object({ action: z.literal("pct"), pct }),
  z.object({ action: z.literal("withdraw") }),
]);

export async function POST(req: Request, ctx: Ctx) {
  const staff = await staffFor("customers");
  if (!staff) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the details." }, { status: 400 });
  const a = parsed.data;
  if (a.action !== "charge" && staff.role !== "admin") return NextResponse.json({ error: "Only the owner can add or refund money, or change the balance settings." }, { status: 403 });

  const id = (await ctx.params).id;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role !== "customer") return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  if (u.status === "closed") return NextResponse.json({ error: "This account is closed." }, { status: 409 });
  const status = balanceStatus(u);
  const who = staff.email;
  let detail: Record<string, unknown> = {};
  let result: Record<string, unknown> = {};

  try {
    await prisma.$transaction(async (tx) => {
      switch (a.action) {
        case "offer":
          if (status === "offered" || status === "active") throw new BalanceError("The balance has already been offered to this customer.");
          await tx.user.update({ where: { id }, data: { balanceStatus: "offered", balanceDiscountPct: a.pct } });
          detail = { pct: a.pct };
          break;
        case "topup":
          if (status !== "offered" && status !== "active") throw new BalanceError("Offer the prepaid balance to this customer first.");
          await changeBalance(tx, id, toPence(a.amount), { kind: "topup", method: a.method, note: a.note, staffEmail: who });
          detail = { amount: a.amount, method: a.method };
          break;
        case "charge": {
          // An eat-in bill: the customer's % comes off, then as much as the balance covers is taken.
          if (!balanceUsable(u)) throw new BalanceError(status === "offered" ? "The customer hasn't accepted the prepaid-balance terms yet, so the balance can't be used." : "This customer's balance can't be used.");
          const discount = Math.round(a.bill * u.balanceDiscountPct) / 100;
          const due = Math.round((a.bill - discount) * 100) / 100;
          const take = Math.min(toPence(due), u.balancePence);
          if (take <= 0) throw new BalanceError("The balance is empty.");
          await changeBalance(tx, id, -take, { kind: "dine-in", note: a.note ?? `bill £${a.bill.toFixed(2)}${discount > 0 ? `, ${u.balanceDiscountPct}% off` : ""}`, staffEmail: who });
          result = { bill: a.bill, discount, due, taken: toPounds(take), stillToPay: Math.max(0, Math.round((due - toPounds(take)) * 100) / 100) };
          detail = result;
          break;
        }
        case "refund":
          await changeBalance(tx, id, -toPence(a.amount), { kind: "refund", method: a.method, note: a.note, staffEmail: who });
          detail = { amount: a.amount, method: a.method };
          break;
        case "pct":
          await tx.user.update({ where: { id }, data: { balanceDiscountPct: a.pct } });
          detail = { from: u.balanceDiscountPct, to: a.pct };
          break;
        case "withdraw":
          if (u.balancePence !== 0) throw new BalanceError(`Refund the £${toPounds(u.balancePence).toFixed(2)} left first.`);
          await tx.user.update({ where: { id }, data: { balanceStatus: "none", balanceTermsVersion: null, balanceTermsAcceptedAt: null } });
          break;
      }
      await audit({ actor: actorOf(staff), action: `balance.${a.action}`, entity: "user", entityId: id, detail, ip: clientIp(req) }, tx);
    });
  } catch (e) {
    if (e instanceof BalanceError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ...(await view(id, staff.role === "admin")), result });
}
