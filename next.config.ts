import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
