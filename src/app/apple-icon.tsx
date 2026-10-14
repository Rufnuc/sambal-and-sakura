import { ImageResponse } from "next/og";

// Home-screen icon for iPhone/iPad ("Add to Home Screen"): the logo mark on the brand's dark background.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#211d17" }}>
        <div style={{ width: 120, height: 120, borderRadius: 120, display: "flex", alignItems: "center", justifyContent: "center", border: "12px solid #e0a83e", background: "#1b1812" }}>
          <div style={{ width: 34, height: 34, borderRadius: 34, background: "#e2869a", display: "flex" }} />
        </div>
      </div>
    ),
    size,
  );
}
