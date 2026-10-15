import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { referralSummary } from "@/server/referrals";

// The signed-in customer's own referral code and how many friends have joined / been rewarded.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await referralSummary(user.id));
}
