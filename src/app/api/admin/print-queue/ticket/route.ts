import { NextResponse } from "next/server";
import { staffFor } from "@/server/auth";
import { ticketBytes, sampleTicketBytes } from "@/server/print";

// ESC/POS bytes for the tablet printer: ?test=1 (sample ticket) or ?orderId=…&kind=order|cancel (reprint).
// Doesn't change the order's print status.
export async function GET(req: Request) {
  if (!(await staffFor("orders"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  if (sp.get("test") === "1") return NextResponse.json({ bytes: (await sampleTicketBytes()).toString("base64") });
  const id = sp.get("orderId") ?? "";
  const kind = sp.get("kind") === "cancel" ? "cancel" : "order";
  if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const bytes = await ticketBytes(id, kind, { reprint: kind === "order" });
  return bytes ? NextResponse.json({ bytes: bytes.toString("base64") }) : NextResponse.json({ error: "Order not found." }, { status: 404 });
}
