import { ImageResponse } from "next/og";

export const alt = "Sambal & Sakura - Chinese & Japanese, Middlesbrough";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1b1812 0%, #262018 55%, #161309 100%)",
          color: "#f3ecdd",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* glow accents */}
        <div style={{ position: "absolute", top: -120, right: -80, width: 420, height: 420, borderRadius: 420, background: "rgba(217,154,43,0.22)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -140, left: -60, width: 360, height: 360, borderRadius: 360, background: "rgba(192,54,44,0.18)", display: "flex" }} />

        {/* mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 76, height: 76, borderRadius: 76, display: "flex", alignItems: "center", justifyContent: "center",
              border: "6px solid #e0a83e", background: "#211d17",
            }}
          >
            <div style={{ width: 20, height: 20, borderRadius: 20, background: "#e2869a", display: "flex" }} />
          </div>
          <div style={{ fontSize: 30, letterSpacing: 2, color: "#e0a83e", fontWeight: 700, textTransform: "uppercase", display: "flex" }}>
            Middlesbrough
          </div>
        </div>

        {/* title */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, display: "flex" }}>
            Sambal <span style={{ color: "#e9b84a", display: "flex", margin: "0 18px" }}>&</span> Sakura
          </div>
          <div style={{ fontSize: 38, color: "rgba(243,236,221,0.82)", marginTop: 20, display: "flex" }}>
            Chinese classics &amp; Japanese specials
          </div>
        </div>

        {/* footer strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 40 }}>
          <div style={{ display: "flex", background: "#e9b84a", color: "#221302", fontSize: 28, fontWeight: 700, padding: "12px 26px", borderRadius: 999 }}>
            Order online
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "rgba(243,236,221,0.7)" }}>
            Dim sum · Aromatic duck · Katsu · Boba
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
