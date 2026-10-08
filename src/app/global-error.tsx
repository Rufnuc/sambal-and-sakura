"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "#17140f",
          color: "#f3ecdd",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 800, color: "#e9b84a" }}>Sambal &amp; Sakura</div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "rgba(243,236,221,0.7)", maxWidth: 420 }}>
          The app hit an unexpected error. Please reload. {error.digest ? `(Ref: ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          style={{ background: "#e9b84a", color: "#221302", border: 0, borderRadius: 999, padding: "12px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
