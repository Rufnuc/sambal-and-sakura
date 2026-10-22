import type { NextConfig } from "next";

const PROD = process.env.NODE_ENV === "production";

// Content Security Policy: which sources the browser may load. Only our own scripts (plus
// Cloudflare's bot check), no plugins, and nobody may put the site in a frame (clickjacking).
// Inline scripts stay allowed because Next.js and the JSON-LD blocks use them.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${PROD ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://challenges.cloudflare.com${PROD ? "" : " ws: wss:"}`,
  "frame-src https://www.google.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(PROD ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
  ...(PROD ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // The files crawlers fetch first are cached at the edge (Cloudflare) for a day, so Googlebot always gets
    // robots.txt instantly. If the server is slow or waking up and robots.txt fails, Google treats the whole
    // site as blocked ("No information is available for this page") until it checks again.
    const crawlerFile = [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/robots.txt", headers: crawlerFile },
      { source: "/sitemap.xml", headers: crawlerFile },
      { source: "/llms.txt", headers: crawlerFile },
      { source: "/llms-full.txt", headers: crawlerFile },
    ];
  },
  // The FAQ moved onto the Contact page. A server-level 308 (not a page-level redirect, which can only
  // redirect client-side under a loading boundary) keeps old links and Google results working.
  async redirects() {
    return [
      { source: "/faq", destination: "/contact#faq", permanent: true },
      { source: "/wheel", destination: "/offers?tab=wheel", permanent: false },
      { source: "/refer", destination: "/offers?tab=refer", permanent: false },
    ];
  },
  // Prisma's engine must not be bundled by Turbopack.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
