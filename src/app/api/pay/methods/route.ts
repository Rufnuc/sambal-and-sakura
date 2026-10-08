import { NextResponse } from "next/server";
import { wechatAvailable } from "@/server/wechat";

// Tells the checkout which optional payment methods are currently usable.
export async function GET() {
  return NextResponse.json({ wechat: wechatAvailable() });
}
