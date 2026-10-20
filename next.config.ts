import type { NextConfig } from "next";

/** Procurement used to live at the site root; keep old bookmarks and shared links working. */
const MOVED_TO_PROCUREMENT = ["compare", "import", "alerts", "price-lists", "suppliers", "products"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss", "bcryptjs"],
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
