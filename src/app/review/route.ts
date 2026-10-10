import { NextResponse } from "next/server";
import { getSiteContent } from "@/server/site-content";
import { SITE_URL } from "@/lib/site-url";

// A short, permanent address for the NFC review card and QR codes: https://<site>/review
// It forwards to the Google review link saved in Admin -> Site content, so the link can change later
// without reprogramming any card. A temporary (307) redirect on purpose, because the target can change.
export const dynamic = "force-dynamic";

export async function GET() {
  const { business } = await getSiteContent();
  const target = business.googleReviewUrl || `${SITE_URL}/contact`;
  return NextResponse.redirect(target, 307);
}
