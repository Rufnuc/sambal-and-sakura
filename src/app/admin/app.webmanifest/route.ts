import { RESTAURANT } from "@/lib/data/site";

// The staff app: "Install app" / "Add to Home Screen" from any admin page opens the Orders screen
// full-screen, like an app. Public on purpose (browsers fetch manifests without cookies); it holds
// nothing private. The customer site has its own manifest (src/app/manifest.ts).
export function GET() {
  const manifest = {
    id: "/admin/",
    name: `${RESTAURANT.name} - Orders`,
    short_name: "S&S Orders",
    description: "Orders, bookings and kitchen tools for staff.",
    start_url: "/admin/orders",
    scope: "/admin/",
    display: "standalone",
    orientation: "any",
    background_color: "#1b1812",
    theme_color: "#211d17",
    icons: [
      { src: "/app-icon/192", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/app-icon/512", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/app-icon/512", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
