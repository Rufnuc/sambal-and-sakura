import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { printTest, printerProvider } from "@/server/print";

// Admin-only: whether the optional PrintNode route is set up, and a "send test print" button for it.
async function adminOnly() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}

export async function GET() {
  if (!(await adminOnly())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // The kitchen printer itself is plugged into the tablet (see Orders); this reports the optional PrintNode route.
  return NextResponse.json({ provider: printerProvider(), printerSn: null });
}

export async function POST() {
  if (!(await adminOnly())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await printTest());
}
