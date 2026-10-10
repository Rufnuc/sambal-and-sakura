import { NextResponse } from "next/server";
import { currentUser, destroySession, destroyOtherSessions } from "@/server/auth";

// POST /api/auth/logout            sign out this browser
// POST /api/auth/logout?all=1      sign out every device (e.g. a lost phone or shared tablet)
export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get("all") === "1") {
    const user = await currentUser();
    if (user) await destroyOtherSessions(user.id, false);
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
