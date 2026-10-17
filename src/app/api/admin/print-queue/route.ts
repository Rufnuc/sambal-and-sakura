import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { claimTabletJobs } from "@/server/print";

// The kitchen tablet's USB printer asks for work. Each ticket is handed out once (see print.ts).
export async function POST() {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ jobs: await claimTabletJobs() });
}
