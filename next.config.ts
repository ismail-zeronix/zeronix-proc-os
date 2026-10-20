import type { NextConfig } from "next";

/** Procurement used to live at the site root; keep old bookmarks and shared links working. */
const MOVED_TO_PROCUREMENT = ["compare", "import", "alerts", "price-lists", "suppliers", "products"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss", "bcryptjs"],
  // The login gate (proxy.ts) buffers request bodies, 10 MB by default and silently cut off beyond that.
  // Email attachments (15 MB) and Excel price lists (15 MB) need more room.
  experimental: { proxyClientMaxBodySize: "20mb" },
  async redirects() {
    return MOVED_TO_PROCUREMENT.flatMap((p) => [
      { source: `/${p}`, destination: `/procurement/${p}`, permanent: false },
      { source: `/${p}/:path*`, destination: `/procurement/${p}/:path*`, permanent: false },
    ]);
  },
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
