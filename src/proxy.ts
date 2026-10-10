import { NextResponse, type NextRequest } from "next/server";

// Runs before every API request (Next 16 "proxy", formerly middleware).
//
// Cross-site request forgery: a malicious page can make a visitor's browser POST to our API with
// their cookies (e.g. sign them into an attacker's account, or act as a signed-in staff member).
// Browsers always say where such a request comes from (Origin / Sec-Fetch-Site), so any
// state-changing API call from another site is refused. WeChat's server-to-server payment
// notifications are exempt: they're verified by signature instead.

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT = ["/api/pay/wechat/notify"];

export function proxy(req: NextRequest) {
  if (WRITE.has(req.method) && !EXEMPT.includes(req.nextUrl.pathname)) {
    const site = req.headers.get("sec-fetch-site");
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    let sameOrigin = true;
    if (site) sameOrigin = site === "same-origin" || site === "none";
    else if (origin) {
      try { sameOrigin = new URL(origin).host === host; } catch { sameOrigin = false; }
    }
    if (!sameOrigin) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
    // JSON APIs only accept JSON (blocks text/plain form tricks); uploads use multipart.
    const type = req.headers.get("content-type") ?? "";
    const isUpload = req.nextUrl.pathname === "/api/admin/upload";
    const hasBody = req.headers.get("content-length") !== "0" && (req.headers.has("content-length") || req.headers.has("transfer-encoding"));
    if (hasBody && !isUpload && !type.startsWith("application/json")) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
