import { ImageResponse } from "next/og";

// PNG app icons (192 / 512 px) for "Install app" on Android and desktop - the same logo mark as the
// iPhone icon (src/app/apple-icon.tsx), with padding so it also works as a "maskable" round icon.
const SIZES = new Set([192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  if (!SIZES.has(n)) return new Response("Not found", { status: 404 });
  const ring = Math.round(n * 0.56), border = Math.round(n * 0.055), dot = Math.round(n * 0.16);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#211d17" }}>
        <div style={{ width: ring, height: ring, borderRadius: ring, display: "flex", alignItems: "center", justifyContent: "center", border: `${border}px solid #e0a83e`, background: "#1b1812" }}>
          <div style={{ width: dot, height: dot, borderRadius: dot, background: "#e2869a", display: "flex" }} />
        </div>
      </div>
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
