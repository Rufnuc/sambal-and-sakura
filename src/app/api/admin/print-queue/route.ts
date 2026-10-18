import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { claimTabletJobs } from "@/server/print";

// The kitchen tablet's USB printer asks for work. Each ticket is handed out once (see print.ts).
// Body {receipt: false} = this tablet doesn't print the customer's copy after the kitchen ticket.
export async function POST(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  return NextResponse.json({ jobs: await claimTabletJobs({ receipt: body?.receipt !== false }) });
}
