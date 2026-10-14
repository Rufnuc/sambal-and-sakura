import { NextResponse } from "next/server";
import { currentUser, verifyPassword, isStaffRole, destroySession } from "@/server/auth";
import { deactivateAccount } from "@/server/accounts";
import { limitOr429 } from "@/server/rate-limit";

// Deactivate your own account (password required). You can reactivate by signing in within 14 days;
// after that the account is closed for good.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isStaffRole(user.role)) return NextResponse.json({ error: "Staff accounts are managed by the owner in Admin → Staff." }, { status: 400 });
  const limited = await limitOr429([{ name: "account-deactivate", id: user.id, limit: 5, windowSec: 900 }]);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  if (typeof body?.password !== "string" || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 400 });
  }
  const deadline = await deactivateAccount(user);
  await destroySession(); // clears this browser's cookie (all sessions were already ended)
  return NextResponse.json({ ok: true, reactivateBy: deadline.toISOString() });
}
