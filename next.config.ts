import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The FAQ moved onto the Contact page. A server-level 308 (not a page-level redirect, which can only
  // redirect client-side under a loading boundary) keeps old links and Google results working.
  async redirects() {
    return [{ source: "/faq", destination: "/contact#faq", permanent: true }];
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
