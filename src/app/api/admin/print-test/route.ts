import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { printTest, printerProvider } from "@/server/print";
import { getSunmiConfig } from "@/server/sunmi";

// Admin-only: which kitchen printer is set up, and a "send test print" button for setting it up.
async function adminOnly() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}

export async function GET() {
  if (!(await adminOnly())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const provider = printerProvider();
  const sn = getSunmiConfig()?.sn;
  // Never reveal secrets; show only the last 4 characters of the printer serial so the owner can recognise it.
  return NextResponse.json({ provider, printerSn: sn ? `…${sn.slice(-4)}` : null });
}

export async function POST() {
  if (!(await adminOnly())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await printTest());
}
